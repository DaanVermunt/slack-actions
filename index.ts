import { WebClient } from '@slack/web-api'
import * as core from '@actions/core'
import * as github from '@actions/github'

const findChannel = async (client: WebClient, name: string) => {
    const listChannelResponse = await client.conversations.list()
    const channels = listChannelResponse.channels as {id: string, name: string}[]
    const channel = channels.find(ch => ch.name === name)

    console.log(channel, name, channels)
    return channel as {id: string; name: string}
}

const run = async () => {
    const actionType = core.getInput('action-type')
    const botOAuthSecret = core.getInput('bot-oauth-secret')
    const userIds = core.getInput('slack-user-ids') || ''

    const githubToken = core.getInput('github-token')
    const payload = github.context.payload
    const octo = github.getOctokit(githubToken)

    const prNum = parseInt(process.env.GITHUB_REF.split('/')[2]) // refs/pull/134/merge

    const getPROptions = {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: prNum,
    }
    const PR = await octo.pulls.get(getPROptions)

    const base = PR.data.base.ref.replace(/[^0-9a-zA-z -]/g, "").replace(/ +/g, "-").toLowerCase()
    const head = PR.data.head.ref.replace(/[^0-9a-zA-z -]/g, "").replace(/ +/g, "-").toLowerCase()

    const channelName = `pr_${prNum}_${head}_${base}`

    const slackClient = new WebClient(botOAuthSecret)

    switch (actionType) {
        case 'PR_OPEN':
            await octo.issues.addLabels({
                owner: payload.repository.owner.login,
                repo: payload.repository.name,
                issue_number: prNum,
                labels: [`${prNum}`],
            })

            const newChannelResp = await slackClient.conversations.create({
                name: channelName,
                is_private: false,
            })
            const newChannel = newChannelResp.channel as { id: string }

            await slackClient.conversations.invite({
                channel: newChannel.id,
                users: userIds,
            })
            await slackClient.chat.postMessage({
                channel: newChannel.id,
                text: '',
                blocks: [{
                            type: "section",
                            text: {
                                type: "mrkdwn",
                                text: `Post \`/github subscribe ${payload.repository.full_name} comments +label:${prNum}\` in order to get comment messages`,
                            }
                        }],
            })

            break
        case 'PR_CLOSED':
            const channel = await findChannel(slackClient, channelName)
            await slackClient.conversations.archive({
                channel: channel.id
            })
            break
        default:
            console.log(`FAIL`)
            core.setFailed('Unknown slack action')
    }
}

run()
    .then(() => core.setOutput('my_feelings', 'YEAH'))
    .catch((error) => core.setFailed(error.message))