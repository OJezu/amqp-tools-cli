import {ChildProcess, spawn} from "child_process";
import {v4} from "uuid";
import ChildProcessError from "../Error/ChildProcessError";
import AmqpConnector from "./AmqpConnector";

import Logger = require("bunyan");

export default class ChildProcessRunner {
  private _logger: Logger;

  constructor({logger}: {logger: Logger}) {
    this._logger = logger;
  }

  public async run(command: string, commandArgs: string[], stdin: Buffer): Promise<number> {
    const childLogger = this._logger.child({childProcess: v4()});

    childLogger.info(`Creating a child process for command: ${command} ${commandArgs.join(" ")}`);
    const childProcess = spawn(command, commandArgs, {detached: true});
    const handlers = this.setupSignalInterceptors(childProcess);

    const childProcessPromise = new Promise<number>((resolve, reject) => {
      childProcess.stdout && childProcess.stdout.on("data", (data) => childLogger.info(data.toString()));
      childProcess.stderr && childProcess.stderr.on("data", (data) => childLogger.info(data.toString()));

      childProcess.on("error", (error) => {
        reject(error);
      });
      childProcess.on("exit", (code, signalName) => {
        if (code === 0) {
          childLogger.info(`Child process ended with code ${code}`);
          resolve(0);
        } else if (code !== null) {
          childLogger.error(`Child process ended with code ${code}`);
          reject(new ChildProcessError(`Child process ended with code ${code}`));
        } else {
          childLogger.warn(`Child process ended due to signal ${signalName}`);
          reject(new ChildProcessError(`Child process ended due to signal ${signalName}`));
        }
      });
    }).finally(() => {
      handlers.forEach((handler) => process.removeListener(...handler));
    });

    if (childProcess.stdin) {
      childProcess.stdin.end(stdin);
    } else {
      process.kill(-childProcess.pid);
      throw new Error("Child process does not have an open stdin, cannot redirect the message");
    }

    return childProcessPromise;
  }

  private setupSignalInterceptors(childProcess: ChildProcess): Array<[NodeJS.Signals, NodeJS.SignalsListener]> {
    return AmqpConnector.INTERCEPTED_SIGNALS.map(
      (signalName): [NodeJS.Signals, NodeJS.SignalsListener] => {
        const listener = () => {
          this._logger.debug(`Forwarding signal ${signalName} to child process.`);
          process.kill(-childProcess.pid, signalName);
        };
        process.on(signalName, listener);

        return [
          signalName,
          listener,
        ];
      },
    );
  }
}
