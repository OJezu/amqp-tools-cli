import {ConfirmChannel, connect, Connection, Message} from "amqplib";
import Logger = require("bunyan");
import AmqpConfiguration from "../Configuration/AmqpConfiguration";
import ConsumeConfiguration from "../Configuration/ConsumeConfiguration";
import ExchangeConsumeConfiguration from "../Configuration/ExchangeConsumeConfiguration";
import MessagePublishConfiguration from "../Configuration/MessagePublishConfiguration";
import QueueConsumeConfiguration from "../Configuration/QueueConsumeConfiguration";

export default class AmqpConnector {
  private readonly _logger: Logger;
  private readonly _amqpChannel: Promise<ConfirmChannel>;
  private readonly _amqpConnection: Promise<Connection>;
  private _closingAfterCurrentMessages: boolean;
  private _messagesBeingConsumed: number;
  private _onError: (connectionError: (Error | null)) => void;

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

    amqpChannel.publish(
      messageConfiguration.exchangeName(),
      messageConfiguration.routingKey(),
      content,
      messageConfiguration.messageOptions(),
    );

    await amqpChannel.waitForConfirms();

    this._logger.info("Published message", {
      exchange: messageConfiguration.exchangeName(),
      options: messageConfiguration.messageOptions(),
      routingKey: messageConfiguration.routingKey(),
    });
  }

  public async close(): Promise<void> {
    const connection = await this._amqpConnection;
    try {
      this._logger.info("Closing amqp connection");
      await connection.close();
    } catch (error) {
      this._logger.warn("Failed to close connection to amqp - it probably has been closed before.");
    }
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

    this._logger.info(`Starting consuming messages from queue ${queueName}`);

    const consumerPromise = amqpChannel.consume(queueName, async (msg: Message | null) => {
        if (msg) {
          // track how many messages are being processed at any time
          ++this._messagesBeingConsumed;
          this._logger.debug(`Messages being consumed: ${this._messagesBeingConsumed}`);

          try {
            await consumerFunction(msg);
            amqpChannel.ack(msg);
          } catch (consumerError) {
            this._logger.error(consumerError);

            // If we are to close on one consumer failing, first cancel consumer and receiving new messages,
            // then wait for all consumers to finish their work and disconnect. The process should end at this point.
            if (configuration.closeOnConsumerError() && !this._closingAfterCurrentMessages) {
              this._closingAfterCurrentMessages = true;
              this._logger.warn("Canceling all consumers");

              // one of the reasons we are shutting down may be connection going away, so expect further errors
              try {
                const consumer = await consumerPromise;
                this._logger.debug("Canceling the consumer");
                await amqpChannel.cancel(consumer.consumerTag);
              } catch (closingError) {
                this._logger.error(closingError);
              }
            }

            this._logger.info("nAck-ing the message back to broker");

            try {
              await amqpChannel.nack(msg);
            } catch {
              this._logger.warn("Failed to nAck the message back to broker, maybe the connection is closed?");
            }
          } finally {
            --this._messagesBeingConsumed;
            this._logger.debug(`Messages being consumed: ${this._messagesBeingConsumed}`);

            if (this._closingAfterCurrentMessages && this._messagesBeingConsumed === 0) {
              this._logger.warn("All consumers finished, closing connection");
              await this.close();
            }
          }
        }
      });

    await consumerPromise;
  }
}
