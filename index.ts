import { WebhookPayload } from '@actions/github/lib/interfaces'
import { WebClient } from '@slack/web-api'
import * as core from '@actions/core'
import * as github from '@actions/github'

const findChannel = async (client: WebClient, name: string, cursor?: string) => {
    const listChannelResponse = await client.conversations.list({limit: 200, cursor})
    const channels = listChannelResponse.channels as { id: string, name: string }[]
    const channel = channels.find(ch => ch.name === name)
    if(!channel) {
        return findChannel(client, name, listChannelResponse.response_metadata.next_cursor)
    }

    return channel as { id: string; name: string }
}

const ActionTypes = ['PR_OPEN', 'PR_CLOSED', 'PR_REVIEWED', 'DEPLOY_STAGING', 'DEPLOY_PRODUCTION'] as const
type ActionType = typeof ActionTypes[number]

const isActionType = (str: string): str is ActionType => {
    return ActionTypes.some(val => val === str)
}

const getChannelName = async (octo: any, payload: any) => {
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

interface Commit {
    author: {
        name: string,
        email: string,
        date: string,
    },
    committer: {
        name: string,
        email: string,
        date: string,
    },
    message: string
}

const getCommitMessages = async (octo: any, payload: any): Promise<string[]> => {
    const commits: { data: Array<{ commit: Commit }> } = await octo.request('GET /repos/{owner}/{repo}/commits', {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        sha: payload.ref.split('/')[2],
        per_page: 100,
    })
    return commits.data.map(com => com.commit.message)
}

const getMessagesToSend = (messages: string[], production: boolean) => {
    // REMOVE FIRST (WHICH IS BUMP)
    const items = messages.slice(1)
    const nextIdx = items.findIndex((m) => m.startsWith('PUSH') && (production ? m.endsWith('production') : m.endsWith('staging')))

    // THEN CREATE LIST UP TO NEXT BUMP
    return items.slice(0, nextIdx).filter(m => !m.startsWith('PUSH'))
}

const postDeployMessages = async (messages: string[], client: any, channel: { id: string; name: string }) => {
    await client.chat.postMessage({
        channel: channel.id,
        text: '',
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '🚀 NEW DEPLOYMENT 🎉🎉🎉 \nNew features: ',
                }
            },
            ...messages.map(m => ({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `- ${m}`,
                },
            })),
        ],
    })
}

const postSingleMessage = async (client: WebClient, channelId: string, message: string) => {
    return await client.chat.postMessage({
        channel: channelId,
        text: '',
        blocks: [{
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: message,
            },
        }],
    })
}

const getReviewPrefix =  (payload: WebhookPayload): string => {
    const state = payload.review.state as 'changes_requested' | 'comment' | 'approved'
    switch (state) {
        case 'changes_requested':
            return ':x: Changes requested'
        case 'approved':
            return ':white_check_mark: Approved'
        case 'comment':
            return ':speed_balloon: Approved'
    }
    return `:question: Reviewed with unknown status ${state}`
}

const getReviewedMessage = (payload: WebhookPayload): string => {
    // TODO CHECK comment and approved
    const prefix = getReviewPrefix(payload)
    const user = payload.review.user.login
    const body = payload.review.body?.length > 0 ? ' : ' + payload.review.body : ''
    return `${prefix} by ${user}${body}`
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
        case 'PR_OPEN': {
            const channelName = await getChannelName(octo, payload)
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
            await postSingleMessage(slackClient, newChannel.id, `Go to https://github.com/${payload.repository.full_name}/pull/${prNum} to view the pull request.`)

            break

        }
        case 'PR_CLOSED': {
            const channelName = await getChannelName(octo, payload)
            const channel = await findChannel(slackClient, channelName)
            await slackClient.conversations.archive({
                channel: channel.id,
            })
            break
        }

        case 'PR_REVIEWED': {
            const channelName = await getChannelName(octo, payload)
            const message = getReviewedMessage(payload)
            const channel = await findChannel(slackClient, channelName)
            await postSingleMessage(slackClient, channel.id, message)
            break

        }

        case 'DEPLOY_STAGING':
            const messages = await getCommitMessages(octo, payload)
            const messagesToSend = getMessagesToSend(messages, false)
            const deployStaging = await findChannel(slackClient, 'keywi-deployments-staging')

            await postDeployMessages(messagesToSend, slackClient, deployStaging)
            break

        case 'DEPLOY_PRODUCTION':
            const messagesProd = await getCommitMessages(octo, payload)
            const messagesToSendProd = getMessagesToSend(messagesProd, true)
            const deployStagingProd = await findChannel(slackClient, 'keywi-deployments')

            await postDeployMessages(messagesToSendProd, slackClient, deployStagingProd)
            break

    }
}

run()
    .then(() => core.setOutput('my_feelings', 'YEAH'))
    .catch((error) => {
        return core.setFailed(error.message)
    })
