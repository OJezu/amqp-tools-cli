import {spawn} from "child_process";
import {v4} from "uuid";

import Logger = require("bunyan");

export default class ChildProcessRunner {
  private _logger: Logger;

  constructor({logger}: {logger: Logger}) {
    this._logger = logger;
  }

  public async run(command: string, commandArgs: string[], stdin: Buffer): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        const childLogger = this._logger.child({childProcess: v4()});

        childLogger.info(`Creating a child process for command: ${command} ${commandArgs.join(" ")}`);
        const childProcess = spawn(command, commandArgs);

        childProcess.stdout && childProcess.stdout.on("data", (data) => childLogger.info(data.toString()));
        childProcess.stderr && childProcess.stderr.on("data", (data) => childLogger.info(data.toString()));

        childProcess.on("error", (error) => {
          reject(error);
        });
        childProcess.on("close", (code) => {
          if (code === 0) {
            childLogger.info(`Child process ended with code ${code}`);
            resolve(0);
          } else {
            reject(`Child process ended with code ${code}`);
          }
        });

        if (childProcess.stdin) {
          childProcess.stdin.end(stdin);
        } else {
          childProcess.kill();
          throw new Error("Child process does not have an open stdin, cannot redirect the message");
        }
      } catch (e) {
        reject(e);
      }
    });
  }
}
