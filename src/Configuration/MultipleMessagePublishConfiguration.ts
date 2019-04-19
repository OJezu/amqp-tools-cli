import {Argv} from "yargs";

import MessagePublishConfiguration from "./MessagePublishConfiguration";

export default class MultipleMessagePublishConfiguration extends MessagePublishConfiguration {
  public static decorateYargs(yargs: Argv): Argv {
    return MessagePublishConfiguration.decorateYargs(yargs)
      .option("separator", {
        default: "\n",
        type: "string",
      })
    ;
  }

  private readonly _separator: string;

  constructor(args: any) {
    super(args);

    this._separator = args.separator;
  }

  public separator(): string {
    return this._separator;
  }
}
