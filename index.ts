import * as core from '@actions/core'
import * as github from '@actions/github'

try {
    // `who-to-greet` input defined in action metadata file
    const botOAuthSecret = core.getInput('bot-oauth-secret');
    const channel = core.getInput('channel-to-create');
    console.log(`Hello ${botOAuthSecret}!`);
    console.log(`Hello ${channel}!`);
    console.log(`Hello ${channel}!`);
    const time = (new Date()).toTimeString();
    core.setOutput("time", time);
    // Get the JSON webhook payload for the event that triggered the workflow
    const payload = JSON.stringify(github.context.payload, undefined, 2)
    console.log(`The event payload: ${payload}`);
} catch (error) {
    core.setFailed(error.message);
}