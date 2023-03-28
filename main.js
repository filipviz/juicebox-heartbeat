import dotenv from "dotenv";
dotenv.config();

const discord_webhook = process.env.DISCORD_WEBHOOK;
const juicebox_subgraph = process.env.JUICEBOX_SUBGRAPH;

// v2 payments within last minute
const query = `{
  payEvents(where:{timestamp_gt: ${
    Math.floor(Date.now() / 1000) - 60
  }, pv: "2"}){
    project {
      metadataUri
    }
    amount
    projectId
    beneficiary
    txHash
  }
}`;

main()
  .then(() => console.log(`Successful run`))
  .catch((e) => console.error(e));


async function main() {
  fetch(juicebox_subgraph, {
    headers: { "Content-Type": "application/json" },
    method: "POST",
    body: JSON.stringify({ query }),
  })
    .then((res) => res.json())
    .then(async (json) => {
      for (const payEvent of json.data.payEvents) {
        console.log(`Notifying ${payEvent.txHash}`);
        const metadata = await fetch(
          `https://ipfs.io/ipfs/${payEvent.project.metadataUri}`
        ).then((res) => res.json());
        const project_name = metadata.name
          ? metadata.name
          : `project ${payEvent.projectId}`;
        const ens = await fetch(
          `https://api.ensideas.com/ens/resolve/${payEvent.beneficiary}`
        ).then((res) => res.json());
        const beneficiary = ens.name ? ens.name : payEvent.beneficiary;

        // Post
        fetch(discord_webhook, {
          headers: { "Content-Type": "application/json" },
          method: "POST",
          body: JSON.stringify({
            embeds: [
              {
                title: `Payment to ${project_name}`,
                url: `https://etherscan.io/tx/${payEvent.txHash}`,
                color: 9539981,
                fields: [
                  {
                    name: `Amount`,
                    value: `${payEvent.amount / 1e18} ETH`,
                    inline: true,
                  },
                  {
                    name: `Beneficiary`,
                    value: `[${beneficiary}](https://etherscan.io/address/${payEvent.beneficiary})`,
                    inline: true,
                  },
                  {
                    name: `Project`,
                    value: `[${project_name}](https://juicebox.money/v2/p/${payEvent.projectId})`,
                    inline: true,
                  },
                ],
              },
            ],
          }),
          thumbnail: {
            url: metadata.logoUri
              ? `https://ipfs.io/ipfs/${metadata.logoUri.substring(
                  metadata.logoUri.lastIndexOf("/") + 1
                )}`
              : undefined,
          },
        });
      }
    });
}
