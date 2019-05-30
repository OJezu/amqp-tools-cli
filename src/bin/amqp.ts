#!/usr/bin/env node

// tslint:disable:no-console

import yargs from "yargs";

import ConsumeExchangeCommand from "../Command/ConsumeExchangeCommand";
import ConsumeQueueCommand from "../Command/ConsumeQueueCommand";
import PublishCommand from "../Command/PublishCommand";
import PublishMultipleCommand from "../Command/PublishMultipleCommand";
import CommandLoader from "../Service/CommandLoader";

// node 8 does not have finally method on promises, and that makes me sad.
// tslint:disable-next-line:no-var-requires
require("promise.prototype.finally").shim();

yargs.strict();
yargs.recommendCommands();
yargs.env("AMQP_TOOLS");

const commandLoader = new CommandLoader({yargs});

commandLoader.registerCommand(new ConsumeExchangeCommand());
commandLoader.registerCommand(new ConsumeQueueCommand());
commandLoader.registerCommand(new PublishCommand());
commandLoader.registerCommand(new PublishMultipleCommand());

commandLoader.run().catch((error) => {
  console.log(error);
  process.exit(1);
});
