import Logger from "bunyan";
import {Argv} from "yargs";

import QueueConsumeConfiguration from "../Configuration/QueueConsumeConfiguration";
import AmqpConnector from "../Service/AmqpConnector";
import ChildProcessConsumer from "../Service/ChildProcessConsumer";
import ChildProcessRunner from "../Service/ChildProcessRunner";
import CommandInterface from "./CommandInterface";

export default class ExchangeConsumeCommand implements CommandInterface<QueueConsumeConfiguration> {
  public commandName(): string {
    return "consume-queue";
  }

  public commandDescription(): string {
    return "Consumes messages from existing queue.";
  }

  public decorateYargs(yargs: Argv): Argv {
    return QueueConsumeConfiguration.decorateYargs(yargs);
  }

  public async run(
    {logger, amqpConnector, configuration}:
    {logger: Logger, amqpConnector: AmqpConnector, configuration: QueueConsumeConfiguration},
  ): Promise<void> {
    const commandRunner = new ChildProcessRunner({logger});
    const commandConsumer = new ChildProcessConsumer({configuration, commandRunner});
    await amqpConnector.consumeFromQueue(configuration, commandConsumer.getConsumer());
  }

  public getConfiguration(argv: any): QueueConsumeConfiguration {
    return new QueueConsumeConfiguration(argv);
  }
}
