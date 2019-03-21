import {Argv} from "yargs";
import CommandConfiguration from "./CommandConfiguration";

export default abstract class ConsumeConfiguration extends CommandConfiguration {

  public static decorateYargs(yargs: Argv): Argv {
    return CommandConfiguration.decorateYargs(yargs)
      .command("$0 <command>", "Command that will be executed for each message")
      .demandCommand(1)
      .option("n", {
        alias: ["prefetch", "parallel"],
        default: 5,
        type: "number",
      })
      .option("ignore-consumer-errors", {
        default: false,
        type: "boolean",
      })
    ;
  }
  private readonly _n: number;
  private readonly _command: string;
  private readonly _commandArgs: string[];
  private readonly _quitOnConsumerError: boolean;

  protected constructor(args: any) {
    super(args);

    this._n = args.n;
    this._command = args.command;
    this._commandArgs = args._;
    this._quitOnConsumerError = !args.ignoreConsumerErrors;
  }

  public command(): string {
    return this._command;
  }

  public commandArgs(): string[] {
    return this._commandArgs;
  }

  public prefetch(): number {
    return this._n;
  }

  public closeOnConsumerError(): boolean {
    return this._quitOnConsumerError;
  }
}
