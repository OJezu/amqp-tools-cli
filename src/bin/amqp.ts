#!/usr/bin/env node

// tslint:disable:no-console

import yargs from "yargs";

import ConsumeExchangeCommand from "../Command/ConsumeExchangeCommand";
import ConsumeQueueCommand from "../Command/ConsumeQueueCommand";
import PublishCommand from "../Command/PublishCommand";
import CommandLoader from "../Service/CommandLoader";

yargs.strict();
yargs.recommendCommands();
yargs.env("AMQP");

const commandLoader = new CommandLoader({yargs});

commandLoader.registerCommand(new ConsumeExchangeCommand());
commandLoader.registerCommand(new ConsumeQueueCommand());
commandLoader.registerCommand(new PublishCommand());

commandLoader.run().catch((error) => {
  console.log(error);
  process.exit(1);
});