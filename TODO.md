# TODO

figure out openai subscription options if realistic

library import, possibly with `await ask("prompt", options)`

output format control in batch mode

error handling in the loop - catch and make synthetic message is not appropriate in batch mode

since we're passing almost all(?) stuff through render.ts,
should --render=never be achieved by using no-op renders rather than conditionally calling render methods?

configurable system prompt

configurable tool - by providing TS, how exactly?

unified solution for finding assets that may be built in or provided by the tool, ie prompts and tools?

decide on resolving "--resume" confusion over both resuming and starting new session with given ID
