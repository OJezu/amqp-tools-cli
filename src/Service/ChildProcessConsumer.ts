import {Message} from "amqplib";
import ConsumeConfiguration from "../Configuration/ConsumeConfiguration";
import ChildProcessRunner from "./ChildProcessRunner";

export default class ChildProcessConsumer {
  private _configuration: ConsumeConfiguration;
  private _commandRunner: ChildProcessRunner;

  constructor(
    {commandRunner, configuration}
    : {commandRunner: ChildProcessRunner, configuration: ConsumeConfiguration},
  ) {
    this._configuration = configuration;
    this._commandRunner = commandRunner;
  }

  public getConsumer(): (msg: Message) => Promise<void> {
    return async (msg: Message): Promise<void> => {
      await this._commandRunner.run(
        this._configuration.command(),
        this._configuration.commandArgs(),
        msg.content,
      );
    };
  }
}
