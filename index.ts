import { WebClient } from '@slack/web-api'
import * as core from '@actions/core'
import * as github from '@actions/github'

const findChannel = async (client: WebClient, name: string) => {
    const listChannelResponse = await client.conversations.list({limit: 1000})
    const channels = listChannelResponse.channels as { id: string, name: string }[]
    const channel = channels.find(ch => ch.name === name)

    return channel as { id: string; name: string }
}

const ActionTypes = ['PR_OPEN', 'PR_CLOSED', 'DEPLOY_STAGING', 'DEPLOY_PRODUCTION'] as const
type ActionType = typeof ActionTypes[number]

const isActionType = (str: string): str is ActionType => {
    return ActionTypes.some(val => val === str)
}

const getPRdata = async (octo: any, payload: any) => {
    const prNum = payload.number
    const getPROptions = {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: prNum,
    }
    const PR = await octo.pulls.get(getPROptions)

    const base = PR.data.base.ref.replace(/[^0-9a-zA-z -]/g, '').replace(/ +/g, '-').toLowerCase()
    const head = PR.data.head.ref.replace(/[^0-9a-zA-z -]/g, '').replace(/ +/g, '-').toLowerCase()
    return `pr_${prNum}_${head}_${base}`
}

const getCommitMessages = async (octo: any, payload: any) => {
    const commits: { data: Array<{ commit: any }> } = await octo.request('GET /repos/{owner}/{repo}/commits', {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
    })
    console.log(commits.data.map(com => com.commit))
}

const isBumpVersion = (payload: any) => {
    const message = payload?.commits?.[0]?.message
    if (typeof message === 'string') {
        return message.toLowerCase().includes('test') || message.toLowerCase().includes('bump version')
    }
    return false
}

const run = async () => {
    const actionType = core.getInput('action-type')
    const botOAuthSecret = core.getInput('bot-oauth-secret')
    const userIds = core.getInput('slack-user-ids') || ''

    const githubToken = core.getInput('github-token')
    const payload = github.context.payload
    const octo = github.getOctokit(githubToken)

    if (!isActionType(actionType)) {
        core.setFailed('Unknown slack action')
        return
    }

    const prNum = payload.number
    const slackClient = new WebClient(botOAuthSecret)

    switch (actionType) {
        case 'PR_OPEN':
            const channelName = await getPRdata(octo, payload)
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
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `Post \`/github subscribe ${payload.repository.full_name} comments +label:${prNum}\` in order to get comment messages`,
                    },
                }],
            })

            break
        case 'PR_CLOSED':
            const channelName2 = await getPRdata(octo, payload)
            const channel = await findChannel(slackClient, channelName2)
            await slackClient.conversations.archive({
                channel: channel.id,
            })
            break

        case 'DEPLOY_STAGING':
            if (!isBumpVersion(payload)) {
                return
            }
            await getCommitMessages(octo, payload)
            const deployStaging = await findChannel(slackClient, 'keywi-deployments-staging')
        case 'DEPLOY_PRODUCTION':
    }
}

run()
    .then(() => core.setOutput('my_feelings', 'YEAH'))
    .catch((error) => core.setFailed(error.message))
