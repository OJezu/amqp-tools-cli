import Logger from "bunyan";
import {Argv} from "yargs";

import {readFile} from "fs";
import {promisify} from "util";
import MessagePublishConfiguration from "../Configuration/MessagePublishConfiguration";
import AmqpConnector from "../Service/AmqpConnector";
import CommandInterface from "./CommandInterface";

export default class PublishCommand implements CommandInterface<MessagePublishConfiguration> {
  public commandName(): string {
    return "publish-message";
  }

  public commandDescription(): string {
    return "Publishes message from arguments or stdin to named exchange with given routingKey.";
  }

  public decorateYargs(yargs: Argv): Argv {
    return MessagePublishConfiguration.decorateYargs(yargs);
  }

  public async run(
    {logger, amqpConnector, configuration}:
    {logger: Logger, amqpConnector: AmqpConnector, configuration: MessagePublishConfiguration},
  ): Promise<void> {
    let content: Buffer;
    const messageContent = configuration.messageContent();

    if (messageContent) {
      content = Buffer.from(messageContent);
    } else {
      content = await promisify(readFile)("/dev/stdin");
    }

    logger.debug("Emitting message: ", content.toString());

    await amqpConnector.publishMessage(configuration, content);
    await amqpConnector.close();
  }

  public getConfiguration(argv: any): MessagePublishConfiguration {
    return new MessagePublishConfiguration(argv);
  }
}
