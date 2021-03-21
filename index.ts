import { WebClient } from '@slack/web-api'
import * as core from '@actions/core'
import * as github from '@actions/github'

const findChannel = async (client: WebClient, name: string) => {
    const listChannelResponse = await client.conversations.list()
    const channels = listChannelResponse.channels as {id: string, name: string}[]
    const channel = channels.find(ch => ch.name === name)

    return channel as {id: string; name: string}
}

const run = async () => {
    const actionType = core.getInput('action-type')
    const botOAuthSecret = core.getInput('bot-oauth-secret')
    const userIds = core.getInput('slack-user-ids') || ''

    const githubToken = core.getInput('github-token')
    const payload = github.context.payload
    const octo = github.getOctokit(githubToken)

    const prNum = process.env.GITHUB_REF.split('/')[2] // refs/pull/134/merge

    const getPROptions = {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: parseInt(prNum),
    }
    console.log(getPROptions)
    const PR = await octo.pulls.get(getPROptions)

    const base = PR.data.base.ref.replace(/[^0-9a-zA-z -]/g, "").replace(/ +/g, "-").toLowerCase()
    const head = PR.data.head.ref.replace(/[^0-9a-zA-z -]/g, "").replace(/ +/g, "-").toLowerCase()

    const channelName = `pr_${head}_${base}`

    const slackClient = new WebClient(botOAuthSecret)

    console.log(channelName)
    switch (actionType) {
        case 'PR_OPEN':
            let newChannel: {id: string}
            try {
                const newChannelResp = await slackClient.conversations.create({
                    name: channelName,
                    is_private: false,
                })
                newChannel = newChannelResp.channel as { id: string }
            } catch (e) {
                newChannel = await findChannel(slackClient, channelName)
                await slackClient.conversations.unarchive({
                    channel: newChannel.id
                })
            }

            await slackClient.conversations.invite({
                channel: newChannel.id,
                users: userIds,
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