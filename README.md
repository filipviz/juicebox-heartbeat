# juicebox-heartbeat

Send Discord Webhook notifications for new [Juicebox](https://juicebox.money) projects and payments.

## How to Run

1. Install dependencies:

```bash
npm i
```

2. Create a .env file:

```bash
cp .example.env .env
```

3. Fill out your .env file. `juicebox-heartbeat` uses the [Juicebox Subgraph](https://docs.juicebox.money/dev/frontend/subgraph/) to query new events.

4. Install [node.js](https://nodejs.org/) (>=18.0.0), and run on a cronjob. By default, `juicebox-heartbeat` queries the previous 60 seconds of events. An example cronjob:

```cron
* * * * * timeout 120s /usr/bin/node /juicebox-heartbeat/main.js
```
