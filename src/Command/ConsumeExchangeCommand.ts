import Logger from "bunyan";
import {Argv} from "yargs";

import ExchangeConsumeConfiguration from "../Configuration/ExchangeConsumeConfiguration";
import AmqpConnector from "../Service/AmqpConnector";
import ChildProcessConsumer from "../Service/ChildProcessConsumer";
import ChildProcessRunner from "../Service/ChildProcessRunner";
import CommandInterface from "./CommandInterface";

export default class ConsumeExchangeCommand implements CommandInterface<ExchangeConsumeConfiguration> {
  public commandName(): string {
    return "consume-exchange";
  }

  public commandDescription(): string {
    return "Creates an exclusive queue, that will be bound to named exchange with given routingKey,"
      + " and starts consuming messages.";
  }

  public decorateYargs(yargs: Argv): Argv {
    return ExchangeConsumeConfiguration.decorateYargs(yargs);
  }

  public async run(
    {logger, amqpConnector, configuration}:
      {logger: Logger, amqpConnector: AmqpConnector, configuration: ExchangeConsumeConfiguration},
  ): Promise<void> {
    const commandRunner = new ChildProcessRunner({logger});
    const commandConsumer = new ChildProcessConsumer({configuration, commandRunner});
    await amqpConnector.consumeCommandsFromExchange(configuration, commandConsumer.getConsumer());
  }

  public getConfiguration(argv: any): ExchangeConsumeConfiguration {
    return new ExchangeConsumeConfiguration(argv);
  }
}
