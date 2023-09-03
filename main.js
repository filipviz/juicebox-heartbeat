const fs = require("fs");
const TurndownService = require("turndown");
const dotenv = require("dotenv");

dotenv.config();

const turndownService = new TurndownService();

const juicebox_discord_webhook = process.env.JUICEBOX_WEBHOOK;
const peel_discord_webhook = process.env.PEEL_WEBHOOK;
const juicebox_subgraph = process.env.JUICEBOX_SUBGRAPH;
console.log("Juicebox Heartbeat initialized.");

if (!fs.existsSync("recent-runs.json")) {
  fs.writeFileSync(
    "recent-runs.json",
    JSON.stringify({
      lastPayEventTime: Math.floor(Date.now() / 1000),
      lastProjectCreateEventTime: Math.floor(Date.now() / 1000),
    }),
    { encoding: "utf8" }
  );
  console.log("Created new recent-runs.json");
}

let { lastPayEventTime, lastProjectCreateEventTime } = JSON.parse(
  fs.readFileSync("recent-runs.json")
);

const payEventsQuery = `{
  payEvents(where:{timestamp_gt: ${lastPayEventTime}}){
    project {
      handle
      metadataUri
    }
    amount
    projectId
    beneficiary
    txHash
    pv
    timestamp
    note
  }
}`;

const projectCreateEventsQuery = `{
  projectCreateEvents(where:{timestamp_gt: ${lastProjectCreateEventTime}}){
    project{
      handle
      metadataUri
    }
    from
    projectId
    txHash
    pv
    timestamp
  }
}`;

// Utils
async function querySubgraph(query) {
  return fetch(juicebox_subgraph, {
    headers: { "Content-Type": "application/json" },
    method: "POST",
    body: JSON.stringify({ query }),
  }).then((res) => res.json());
}

async function resolveMetadata(metadataUri) {
  return fetch(`https://ipfs.io/ipfs/${metadataUri}`).then((res) => res.json());
}

async function resolveEns(address) {
  const ens = await fetch(
    `https://api.ensideas.com/ens/resolve/${address}`
  ).then((res) => res.json());
  return ens.name ? ens.name : address;
}

async function postToDiscordWebhook(
  webhook_url,
  title,
  url,
  fields,
  thumbnail
) {
  console.log(`New webhook post: ${title}`);
  fetch(webhook_url, {
    headers: { "Content-Type": "application/json" },
    method: "POST",
    body: JSON.stringify({
      embeds: [
        {
          title,
          url,
          color: Math.floor(16777215 * Math.random()), // Random decimal color
          fields,
          thumbnail,
        },
      ],
    }),
  })
    .then((res) => res.text())
    .then((x) => console.log(x));
}

async function handlePayEvents() {
  return new Promise((resolve, reject) => {
    querySubgraph(payEventsQuery).then(async (json) => {
      for (const payEvent of json.data.payEvents) {
        const [metadata, beneficiary] = await Promise.all([
          resolveMetadata(payEvent.project.metadataUri),
          resolveEns(payEvent.beneficiary),
        ]);
        const project_name = metadata.name
          ? metadata.name
          : `v${payEvent.pv} project ${payEvent.projectId}`;

        postToDiscordWebhook(
          juicebox_discord_webhook,
          `Payment to ${project_name}`,
          `https://juicebox.money/${
            payEvent.pv === "2"
              ? "v2/p/" + payEvent.projectId
              : "p/" + payEvent.project.handle
          }`,
          [
            ...(payEvent.note
              ? [{ name: `Note`, value: `*${payEvent.note}*`, inline: false }]
              : []),
            {
              name: `Amount`,
              value: `${payEvent.amount / 1e18} ETH`,
              inline: true,
            },
            {
              name: `Beneficiary`,
              value: `[${beneficiary}](https://juicebox.money/account/${payEvent.beneficiary})`,
              inline: true,
            },
            {
              name: `Transaction`,
              value: `[Etherscan](https://etherscan.io/tx/${payEvent.txHash})`,
              inline: true,
            },
          ],
          {
            url: metadata.logoUri
              ? `https://ipfs.io/ipfs/${metadata.logoUri.substring(
                  metadata.logoUri.lastIndexOf("/") + 1
                )}`
              : undefined,
          }
        )
          .then(() => {
            if (payEvent.timestamp > lastPayEventTime)
              lastPayEventTime = payEvent.timestamp;
          })
          .catch((e) => {
            fs.appendFileSync("errors.txt", e, { encoding: "utf8" });
            reject(e);
          });
      }

      resolve();
    });
  });
}

async function handleCreateEvents() {
  return new Promise((resolve, reject) => {
    querySubgraph(projectCreateEventsQuery).then(async (json) => {
      for (const projectCreateEvent of json.data.projectCreateEvents) {
        const [metadata, from] = await Promise.all([
          resolveMetadata(projectCreateEvent.project.metadataUri),
          resolveEns(projectCreateEvent.from),
        ]);
        const project_name = metadata.name
          ? metadata.name
          : `v${projectCreateEvent.pv} project ${projectCreateEvent.projectId}`;

        const containsHTML = /<\/?[a-z][\s\S]*>/i.test(metadata.description);

        const processedDescription = containsHTML
          ? turndownService
              .turndown(metadata.description)
              .replace(/\n+/g, "\n")
              .slice(0, 1000)
          : metadata.description.slice(0, 1000);

        for (const webhook of [juicebox_discord_webhook, peel_discord_webhook])
          postToDiscordWebhook(
            webhook,
            `New Project: ${project_name}`,
            `https://juicebox.money/${
              projectCreateEvent.pv === "2"
                ? "v2/p/" + projectCreateEvent.projectId
                : "p/" + projectCreateEvent.project.handle
            }`,
            [
              {
                name: `Creator`,
                value: `[${from}](https://juicebox.money/account/${projectCreateEvent.from})`,
                inline: true,
              },
              {
                name: `Transaction`,
                value: `[Etherscan](https://etherscan.io/tx/${projectCreateEvent.txHash})`,
                inline: true,
              },
              {
                name: `Description`,
                value: processedDescription,
                inline: false,
              },
            ],
            {
              url: metadata.logoUri
                ? `https://ipfs.io/ipfs/${metadata.logoUri.substring(
                    metadata.logoUri.lastIndexOf("/") + 1
                  )}`
                : undefined,
            }
          )
            .then(() => {
              if (projectCreateEvent.timestamp > lastProjectCreateEventTime)
                lastProjectCreateEventTime = projectCreateEvent.timestamp;
            })
            .catch((e) => {
              fs.appendFileSync("errors.txt", e, { encoding: "utf8" });
              reject(e);
            });
      }
      resolve();
    });
  });
}

async function main() {
  await Promise.all([handlePayEvents(), handleCreateEvents()]);
  fs.writeFileSync(
    "recent-runs.json",
    JSON.stringify({
      lastPayEventTime,
      lastProjectCreateEventTime,
    }),
    { encoding: "utf8" }
  );
}

main().catch((error) => {
  console.error("An error occurred:", error);
});
