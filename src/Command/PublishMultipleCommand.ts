import Logger from "bunyan";
import {Argv} from "yargs";

import MultipleMessagePublishConfiguration from "../Configuration/MultipleMessagePublishConfiguration";
import AmqpConnector from "../Service/AmqpConnector";
import CommandInterface from "./CommandInterface";

export default class PublishMultipleCommand implements CommandInterface<MultipleMessagePublishConfiguration> {
  private inputBuffer: Buffer;

  public constructor() {
    this.inputBuffer = Buffer.from([]);
  }

  public commandName(): string {
    return "publish-multiple-messages";
  }

  public commandDescription(): string {
    return "Publishes multiple messages from arguments or stdin to named exchange with given routingKey.";
  }

  public decorateYargs(yargs: Argv): Argv {
    return MultipleMessagePublishConfiguration.decorateYargs(yargs);
  }

  public run(
    {logger, amqpConnector, configuration}:
    {logger: Logger, amqpConnector: AmqpConnector, configuration: MultipleMessagePublishConfiguration},
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const messageContent = configuration.messageContent();
      let promises: Array<Promise<void>> = [];

      if (messageContent) {
        this.inputBuffer = Buffer.from(messageContent);
        promises = promises.concat(...this.sendMessagesInBuffer({logger, amqpConnector, configuration}, true));
        Promise.all(promises).then(() => undefined).then(resolve, reject);
      } else {
        process.stdin.on("data", (data: Buffer) => {
          this.inputBuffer = Buffer.concat([this.inputBuffer, data]);
          promises = promises.concat(this.sendMessagesInBuffer({logger, amqpConnector, configuration}, false));
        });

        process.stdin.on("end", () => {
          promises = promises.concat(this.sendMessagesInBuffer({logger, amqpConnector, configuration}, true));
          Promise.all(promises).then(() => undefined).then(resolve, reject);
        });
      }
    }).finally(() => {
      return amqpConnector.close();
    });
  }

  public getConfiguration(argv: any): MultipleMessagePublishConfiguration {
    return new MultipleMessagePublishConfiguration(argv);
  }

  private sendMessagesInBuffer(
    {logger, amqpConnector, configuration}:
    {logger: Logger, amqpConnector: AmqpConnector, configuration: MultipleMessagePublishConfiguration},
    end: boolean,
  ): Array<Promise<void>> {
    const separatorBuffer = Buffer.from(configuration.separator());
    let separatorIndex = this.inputBuffer.indexOf(separatorBuffer);
    const promises = [];

    while (separatorIndex !== -1) {
      const content = this.inputBuffer.slice(0, separatorIndex);
      logger.debug("Emitting message: ", content.toString());
      promises.push(amqpConnector.publishMessage(configuration, content));
      this.inputBuffer = this.inputBuffer.slice(separatorIndex + separatorBuffer.length);
      separatorIndex = this.inputBuffer.indexOf(separatorBuffer);
    }

    if (end) {
      if (this.inputBuffer.length === 0) {
        logger.info("Not emitting empty last message (the input stream ended with a separator sequence)");
      } else {
        logger.debug("Emitting message: ", this.inputBuffer.toString());
        promises.push(amqpConnector.publishMessage(configuration, this.inputBuffer));
        this.inputBuffer = Buffer.from([]);
      }
    }

    return promises;
  }
}
