# TODO

library import, possibly with `await ask("prompt", options)`

markdown output in batch mode

error handling in the loop - catch and make sythetic message is not appopriate in batch mode

just a thought, but since we're passing almost all(?) stuff through render.ts,
should --render=never be achieved by using no-op renders rather than conditionally calling render methods?
