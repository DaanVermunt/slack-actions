import { WebClient } from '@slack/web-api'
import * as core from '@actions/core'
import * as github from '@actions/github'

const findChannel = async (client: WebClient, name: string) => {
    console.log("----CONV----")
    console.log(await client.conversations.list())
    const listChannelResponse = await client.conversations.list()
    const channels = listChannelResponse.channels as { id: string, name: string }[]
    const channel = channels.find(ch => ch.name === name)

    console.log(channel)
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

const getMessagesToSend = (messages: string[], lookForLastDeploy = false) => {
    // REMOVE FIRST (WHICH IS BUMP)
    const items = messages.slice(1)
    const nextIdx = items.findIndex((m) => lookForLastDeploy ? isLastDeploy(m) : isBumpVersion(m))

    // THEN CREATE LIST UP TO NEXT BUMP
    return items.slice(0, nextIdx)
}

const isBumpVersion = (message: any) => {
    if (typeof message === 'string') {
        return message.toLowerCase().includes('bump version') || message.toLowerCase().includes('updated version')
    }
    return false
}

const isLastDeploy = (message: any) => {
    if (typeof message === 'string') {
        return message.toLowerCase().includes('set last deploy')
    }
    return false
}

const postMessages = async (messages: string[], client: any, channel: { id: string; name: string }) => {
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
            // ...messages.map(m => ({
            //     type: 'section',
            //     text: {
            //         type: 'mrkdwn',
            //         text: `- ${m}`,
            //     },
            // })),
        ],
    })
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
            if (!isBumpVersion(payload?.commits?.[0]?.message)) {
                return
            }
            const messages = await getCommitMessages(octo, payload)
            const messagesToSend = getMessagesToSend(messages)
            const deployStaging = await findChannel(slackClient, 'keywi-deployments-staging')
            await postMessages(messagesToSend, slackClient, deployStaging)
            break

        case 'DEPLOY_PRODUCTION':
            if (!isLastDeploy(payload?.commits?.[0]?.message)) {
                return
            }

            const messagesProd = await getCommitMessages(octo, payload)
            const messagesToSendProd = getMessagesToSend(messagesProd, true)

            const deployStagingProd = await findChannel(slackClient, 'keywi-deployments')

            await postMessages(messagesToSendProd, slackClient, deployStagingProd)
            break
    }
}

run()
    .then(() => core.setOutput('my_feelings', 'YEAH'))
    .catch((error) => {
        console.error(error)
        return core.setFailed(error.message)
    })
