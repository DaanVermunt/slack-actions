import { WebClient } from '@slack/web-api'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as moment from 'moment'

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
    const PR = await octo.pulls.get(getPROptions)

    const base = PR.data.base.ref.replace(/[^0-9a-zA-z -]/g, "").replace(/ +/g, "-").toLowerCase()
    const head = PR.data.head.ref.replace(/[^0-9a-zA-z -]/g, "").replace(/ +/g, "-").toLowerCase()

    const date = moment().format('YY-MM-DD')

    const channelName = `pr_${date}_${head}_${base}`

    const slackClient = new WebClient(botOAuthSecret)

    switch (actionType) {
        case 'PR_OPEN':
            const newChannelResp = await slackClient.conversations.create({
                name: channelName,
                is_private: false,
            })
            const newChannel = newChannelResp.channel as { id: string }
            await slackClient.conversations.invite({
                channel: newChannel.id,
                users: userIds,
            })
            break
        case 'PR_CLOSED':
            const listChannelResponse = await slackClient.conversations.list()
            const channels = listChannelResponse.channels as {id: string, name: string}[]
            const channel = channels.find(ch => ch.name === channelName)
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