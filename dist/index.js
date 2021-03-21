"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@actions/core");
try {
    const botOAuthSecret = core_1.default.getInput('bot-oauth-secret');
    const channel = core_1.default.getInput('channel-to-create');
    console.log(`Hello ${botOAuthSecret}!`);
    console.log(`Hello ${channel}!`);
    console.log(`Hello ${channel}!`);
    const time = (new Date()).toTimeString();
    core_1.default.setOutput("time", time);
}
catch (error) {
    core_1.default.setFailed(error.message);
}
//# sourceMappingURL=index.js.map