import {ConfirmChannel, connect, Connection, Message, Options, Replies} from "amqplib";
import Logger = require("bunyan");
import AmqpConfiguration from "../Configuration/AmqpConfiguration";
import ConsumeConfiguration from "../Configuration/ConsumeConfiguration";
import ExchangeConsumeConfiguration from "../Configuration/ExchangeConsumeConfiguration";
import MessagePublishConfiguration from "../Configuration/MessagePublishConfiguration";
import QueueConsumeConfiguration from "../Configuration/QueueConsumeConfiguration";
import ChildProcessError from "../Error/ChildProcessError";
import {PromiseTimeoutError} from "../Error/PromiseTimeoutError";

export default class AmqpConnector {
  public static readonly INTERCEPTED_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  private static readonly QUEUE_WATCHDOG_PERIOD: number = 60 * 1000; // tslint:disable-line:no-magic-numbers

  private readonly _amqpChannel: Promise<ConfirmChannel>;
  private readonly _amqpConnection: Promise<Connection>;
  private readonly _awaitingReply: {[correlationId: string]: () => void};
  private readonly _logger: Logger;
  private readonly _onError: (connectionError: (Error | null)) => void;
  private _amqpConsumer: PromiseLike<Replies.Consume> | undefined;
  private _closingAfterCurrentMessages: boolean;
  private _messagesBeingConsumed: number;
  private _replyQueue: Promise<string> | undefined;
  private _replyConsumer: Promise<Replies.Consume> | undefined;
  private _awaitingReplyCount: number;
  private _queueWatchdogTimeout: NodeJS.Timeout|undefined;
  private _signalHandlers: Array<[NodeJS.Signals, NodeJS.SignalsListener]> | undefined;
  private _closePromise: Promise<void> | undefined;
  private _abortConsumerPromise: Promise<void> | undefined;

  constructor({
    logger,
    amqpConfiguration,
    onError,
  }: {
    logger: Logger,
    amqpConfiguration: AmqpConfiguration,
    onError: (connectionError: Error|null) => void,
  }) {
    this._logger = logger;
    this._onError = onError;

    this._closingAfterCurrentMessages = false;
    this._messagesBeingConsumed = 0;
    this._awaitingReply = {};
    this._awaitingReplyCount = 0;

    this._amqpConnection = this.connect(amqpConfiguration);
    this._amqpChannel = this.openChannel();
  }

  public async consumeFromQueue(
    configuration: QueueConsumeConfiguration,
    consumer: (msg: Message) => Promise<void>,
  ): Promise<void> {
    await this.consume(configuration.queueName(), configuration, consumer);
  }

  public async consumeCommandsFromExchange(
    configuration: ExchangeConsumeConfiguration,
    consumer: (msg: Message) => Promise<void>,
  ): Promise<void> {
    const amqpChannel = await this._amqpChannel;
    const queueName = (await amqpChannel.assertQueue("", {exclusive: true})).queue;
    await amqpChannel.bindQueue(queueName, configuration.exchangeName(), configuration.routingKey());

    await this.consume(queueName, configuration, consumer);
  }

  public async publishMessage(messageConfiguration: MessagePublishConfiguration, content: Buffer): Promise<void> {
    const amqpChannel = await this._amqpChannel;
    // tslint:disable-next-line:no-magic-numbers
    const messageId = Math.random().toString().slice(2);
    const messageOptions = Object.assign({messageId}, messageConfiguration.messageOptions());
    const messageLogger = this._logger.child({messageId});
    messageLogger.debug("Publishing message");
    let replyPromise = Promise.resolve();

    if (messageConfiguration.requestReply()) {
      messageLogger.debug("Setting up reply request");
      messageOptions.replyTo = (await this.replyQueue());
      messageOptions.correlationId = messageId;
      replyPromise = this.awaitReply(amqpChannel, messageOptions, messageConfiguration.replyTimeout());
    }

    amqpChannel.publish(
      messageConfiguration.exchangeName(),
      messageConfiguration.routingKey(),
      content,
      messageOptions,
    );

    messageLogger.info("Published message", {
      exchange: messageConfiguration.exchangeName(),
      options: messageOptions,
      routingKey: messageConfiguration.routingKey(),
    });

    // await for both, replyPromise might timeout at any moment
    (await Promise.all([amqpChannel.waitForConfirms(), replyPromise]));

    return await replyPromise;
  }

  public async close(): Promise<void> {
    if (!this._closePromise) {
      this._closePromise = (async () => {
        if (this._queueWatchdogTimeout) {
          clearTimeout(this._queueWatchdogTimeout);
        }

        this.tearDownSignalHandlers();
        const connection = await this._amqpConnection;
        await this.abortConsumers();

        try {
          this._logger.info("Closing amqp connection");
          await connection.close();
        } catch (error) {
          this._logger.warn("Failed to close connection to amqp - it probably has been closed before.");
        }
      })();
    }

    return this._closePromise;
  }

  private async connect(amqpConfiguration: AmqpConfiguration): Promise<Connection> {
    this._logger.info(
      "Connecting to amqp",
      Object.assign({}, amqpConfiguration.options(), {password: "<censored>"}),
    );

    const amqpConnection = await connect(amqpConfiguration.options());
    amqpConnection.on("close", this._onError);

    return amqpConnection;
  }

  private async openChannel(): Promise<ConfirmChannel> {
    const channel = await (await this._amqpConnection).createConfirmChannel();
    this._logger.debug("Opened amqp ConfirmChannel");

    return channel;
  }

  private async consume(
    queueName: string,
    configuration: ConsumeConfiguration,
    consumerFunction: (msg: Message) => Promise<void>,
  ): Promise<void> {
    const amqpChannel = await this._amqpChannel;
    await amqpChannel.prefetch(configuration.prefetch());
    this._logger.debug(`Prefetch is set to  ${configuration.prefetch()}`);
    this._logger.info(`Starting consuming messages from queue ${queueName}`);

    if (this._amqpConsumer) {
      throw new Error("Consumer already started for this connector");
    }

    this._amqpConsumer = amqpChannel.consume(
      queueName,
      async (msg: Message | null) => {
        this.queueWatchdog(queueName);

        if (msg) {
          ++this._messagesBeingConsumed;
          const messageLogger = this._logger.child({messageId: msg.properties.messageId});
          this._logger.debug(`Messages being consumed: ${this._messagesBeingConsumed}`);

          try {
            if (this._closingAfterCurrentMessages) {
              throw new Error("Consumer is closing but we got another message, skip it.");
            }

            await consumerFunction(msg);
            messageLogger.debug("ack-ing message");
            amqpChannel.ack(msg);

            if (msg.properties.replyTo) {
              messageLogger.debug("Message reply requested", {
                correlationId: msg.properties.correlationId,
                replyTo: msg.properties.replyTo,
              });
              amqpChannel.publish(
                "",
                msg.properties.replyTo,
                Buffer.from([]),
                {correlationId: msg.properties.correlationId},
              );
            }
          } catch (consumerError) {
            // ChildProcessErrors are already logged by ChildProcessRunner
            if (!(consumerError instanceof ChildProcessError)) {
              messageLogger.error(consumerError);
            }

            // If we are to close after one of the consumers failed, first cancel amqp consumer and stop receiving
            // new messages, then wait for all consumers to finish their work and disconnect.
            // The process should exit at this point.
            if (configuration.closeOnConsumerError() && !this._closingAfterCurrentMessages) {
              this._logger.warn("Closing after all current messages are processed");

              // one of the reasons we are shutting down may be connection going away, so expect further errors
              try {
                await this.abortConsumers();
              } catch (closingError) {
                this._logger.error(closingError);
              }
            }

            messageLogger.info("nAck-ing the message back to broker");

            try {
              await amqpChannel.nack(msg);
            } catch {
              messageLogger.warn("Failed to nAck the message back to broker, maybe the connection is closed?");
            }
          } finally {
            --this._messagesBeingConsumed;
            this._logger.debug(`Messages being consumed: ${this._messagesBeingConsumed}`);

            await this.checkForSafeShutdown();
          }
        }
      },
      {noAck: false},
    );

    this.setupSignalHandlers(configuration);
    this.queueWatchdog(queueName);
    await this._amqpConsumer;
  }

  private async abortConsumers(): Promise<void> {
    if (!this._abortConsumerPromise) {
      this._abortConsumerPromise = (async () => {
        const consumers = [
          this._replyConsumer,
          this._amqpConsumer,
        ].filter(Boolean) as Array<PromiseLike<Replies.Consume>>;
        this._closingAfterCurrentMessages = true;
        this._replyConsumer = undefined;
        this._amqpConsumer = undefined;

        await Promise.all(consumers.map(async (consumerPromise) => {
          const [amqpChannel, consumer] = await Promise.all([this._amqpChannel, consumerPromise]);
          this._logger.debug("Canceling the consumer");
          await amqpChannel.cancel(consumer.consumerTag);
        }));
      })();
    }

    return this._abortConsumerPromise;
  }

  private setupSignalHandlers(configuration: ConsumeConfiguration): void {
    if (!this._signalHandlers) {
      process.setMaxListeners(configuration.prefetch() + 1);
      const listener = async (signalName: string) => {
        this._logger.warn(`Received signal ${signalName}, closing after child processes end.`);
        await this.abortConsumers();
        await this.checkForSafeShutdown();
      };

      this._signalHandlers = AmqpConnector.INTERCEPTED_SIGNALS.map(
        (signalName): [NodeJS.Signals, NodeJS.SignalsListener] => {
          process.on(signalName, listener);

          return [
            signalName,
            listener,
          ];
        },
      );
    }
  }

  private tearDownSignalHandlers(): void {
    if (this._signalHandlers) {
      this._signalHandlers.forEach((handler) => process.removeListener(...handler));
    }
  }

  private async checkForSafeShutdown(): Promise<void> {
    if (this._closingAfterCurrentMessages && this._messagesBeingConsumed === 0) {
      this._logger.warn("All consumers finished, closing connection");
      await this.close();
    }
  }

  private replyQueue(): Promise<string> {
    if (!this._replyQueue) {
      this._replyQueue = this._amqpChannel.then(
        async (amqpChannel) => (await amqpChannel.assertQueue("", {exclusive: true})).queue,
      );
    }

    return this._replyQueue;
  }

  private awaitReply(amqpChannel: ConfirmChannel, messageOptions: Options.Publish, timeout: number): Promise<void> {
    if (!messageOptions.replyTo || !messageOptions.correlationId) {
      return Promise.reject(new Error(`Both replyTo and correlationId must be set in messageOptions`));
    }

    if (!this._replyConsumer) {
      this._replyConsumer = amqpChannel.consume(messageOptions.replyTo, (msg: Message | null) => {
        if (msg) {
          if (this._awaitingReply[msg.properties.correlationId]) {
            this._logger.info(`Received reply for message: ${msg.properties.correlationId}`);
            this._awaitingReply[msg.properties.correlationId]();
            delete this._awaitingReply[msg.properties.correlationId];
          } else {
            this._logger.warn(`Received reply for unknown message: ${msg.properties.correlationId}`);
          }
        }
      }, {noAck: true}) as unknown as Promise<Replies.Consume>;
    }

    return PromiseTimeoutError.wrap(
      timeout * 1000, // tslint:disable-line:no-magic-numbers
      new Promise<void>((resolve) => {
        this._logger.debug(`Setting up reply listener for message: ${messageOptions.correlationId}`);
        this._logger.debug(`Awaiting for ${++this._awaitingReplyCount} replies`);
        this._awaitingReply[messageOptions.correlationId as string] = resolve;
      }),
    ).finally(() => {
      delete this._awaitingReply[messageOptions.correlationId as string];
      this._logger.debug(`Awaiting for further ${--this._awaitingReplyCount} replies`);
    });
  }

  private queueWatchdog(queueName: string): void {
    if (this._queueWatchdogTimeout) {
      clearTimeout(this._queueWatchdogTimeout);
    }

    this._queueWatchdogTimeout = setTimeout(async () => {
      const amqpChannel = await this._amqpChannel;
      let queueOk = false;

      try {
        this._logger.debug(`Queue watchdog checking: ${queueName}`);
        await amqpChannel.checkQueue(queueName);
        queueOk = true;
      } catch (error) {
        this._logger.error(error);
      }

      if (queueOk) {
        this.queueWatchdog(queueName);
      } else {
        try {
          await this.abortConsumers();
          await this.checkForSafeShutdown();
        } catch (error) {
          this._onError(error);
        }
      }
    }, AmqpConnector.QUEUE_WATCHDOG_PERIOD);
  }
}
