# amqp-tools-cli

Receive messages from amqp, and spawn processes to handle them on cli - a node.js package.

This package was created as a replacement for [librabbitmq-tools](https://linux.die.net/man/7/librabbitmq-tools),
with added support for heartbeats, logging and (hopefully) less crashing.

## Installation
```
# Install with npm:
npm install --global --no-dev amqp-tools-cli

# Run with npx:
npx amqp --help

```

## Overview
This package adds a npx-available amqp command, which allows publishing messages to amqp and consuming amqp messages
with external programs.

Consumer for each received message a child process running specified program will be launched and fed the message as
stdin. The consumer will periodically check if the connection with server is intact (heartbeat). If processing of
any of the messages fails (child process exits with a non-zero status code), further messages won't be received, and
the consumer will exit after last child process exits.

## Usage

### Common options
 Option name  | type   | required? | default   | description
 ------------ | ------ | --------- | --------- | ---
 help         | flag   | no        |           | Show help and quit
 version      | flag   | no        |           | Show version number and quit
 hostname     | string | no        | localhost | amqp server listening hostname
 port         | number | no        | 5672      | amqp server listening port
 user         | string | no        |           | amqp user
 password     | string | no        |           | amqp password
 vhost        | string | no        | /         | amqp vhost
 heartbeat    | number | no        | 60        | heartbeat in seconds, if server does not respond within 2 heartbeats, the connection will be closed
 log-level    | string | no        | warn      | valid values are: fatal, error, warn, info, trace, debug

All options can be read from environmental variables with prefix "AMQP_TOOLS", e.g. password can be given as:

```
npx amqp consume-queue --queue="queue" --password="mysecretpassword" -- ./on-message.sh # password on command line, a bad idea
```

or:

```
env AMQP_TOOLS_PASSWORD="mysecretpassword" npx amqp consume-queue --queue="queue" -- ./on-message.sh
```

### amqp consume-queue

Consumes messages from an existing queue.

 Option name                | type   | required? | default | description
 -------------------------- | ------ | --------- | ------- | ---
 -n, --prefetch, --parallel | number | no        | 5       | How many messages can be processed in parallel
 --ignore-consumer-errors   | flag   | no        | false   | Continue operations if a command run for message exits with a non-zero status
 --reject-after-tries       | number | no        | 0       | If message caused consumer to fail this many times, reject it. Values equal or less than 0 disable this check. If reject-after-seconds is also specified, both have to be satisfied for rejection to happen.
 --reject-after-seconds     | number | no        | 0       | If message caused consumer to fail and was first published more than this many seconds, reject it. Values equal or less than 0 disable this check. If reject-after-tries is also specified, both have to be satisfied for rejection to happen.
 --queue                    | string | yes       |         | Name of the queue to consume commands from
 [--] command               | string | yes       |         | Command/program to invoke for each message with the message content on stdin
 ...commandArguments        | any    | no        |         | Arguments for the command/program


#### examples

Print messages from amqp queue:

```
npx amqp consume-queue --queue "queueName" -- cat
```

Use messages as arguments for a program:

```
npx amqp consume-queue --queue "queueName" -- xargs your-program
```

### amqp consume-exchange
Creates an exclusive queue, binds it to an existing exchange using provided routing-key, and consumes messages.

 Option name                | type   | required? | default | description
 -------------------------- | ------ | --------- | ------- | ---
 -n, --prefetch, --parallel | number | no        | 5       | How many messages can be processed in parallel
 --ignore-consumer-errors   | flag   | no        | false   | Continue operations if a command run for message exits with a non-zero status
 --reject-after-tries       | number | no        | 0       | If message caused consumer to fail this many times, reject it. Values equal or less than 0 disable this check. If reject-after-seconds is also specified, both have to be satisfied for rejection to happen.
 --reject-after-seconds     | number | no        | 0       | If message caused consumer to fail and was first published more than this many seconds, reject it. Values equal or less than 0 disable this check. If reject-after-tries is also specified, both have to be satisfied for rejection to happen.
 --exchange                 | string | yes       |         | Name of the exchange to bind to
 --routing-key              | string | yes       |         | Routing key pattern to bind with
 [--] command               | string | yes       |         | Command/program to invoke for each message with the message content on stdin
 ...commandArguments        | any    | no        |         | Arguments for the command/program

#### examples

Listen for all messages passing through topic exchange

```
npx amqp consume-exchange --exchange "amq.topic" --routing-key "#"  -- cat
```

### amqp publish-message

 Publish a message to exchange with given routing key

 Option name    | type   | required? | description
 -------------- | ------ | --------- | -------
 --exchange     | string | yes       | Name of exchange to which the message will be published
 --routing-key  | string | yes       | Routing key set on the message
 --content-type | string | no        | Content-type of the message
 [--] content   | string | no        | Content of the message, if missing, content will be read from stdin

#### examples

Publish a message to default exchange from command line arguments:

```
npx amqp publish-message --exchange "" --routing-key "queue" -- "Hello I love you, won't you tell me your name?"
```

Publish a JSON message from stdin:

```
echo '["Hello I love you, let me jump into your game."]' \
  | npx amqp publish-message --exchange "" --routing-key "queue" --content-type="application/json"
```

### Testing

Simplest way to test this library with docker:
```
docker run -d --hostname my-rabbit --name some-rabbit -p 5672:5672 rabbitmq:3
uild/bin/amqp.js consume-exchange --exchange="amq.direct" --routing-key=""  --log-level=info -- cat

#in different terminal
echo "message" | build/bin/amqp.js publish-message --exchange="" --routing-key=""
```

Real tests might get even written at some point.

### Notes
If different message published is used, to make sure `--reject-after-seconds` measures from the time the message was first published, set header
`x-first-published-timestamp: <unix timestamp>` when publishing the message
