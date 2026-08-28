const coap: any = require('coap');

function closeCoapAgent(agent: any): Promise<void> {
  if (!agent?._sock) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let finished = false;

    const finish = () => {
      if (finished) return;

      finished = true;
      agent.removeListener?.('close', finish);
      resolve();
    };

    agent.once?.('close', finish);

    try {
      agent.close(finish);
    } catch {
      agent._sock?.unref?.();
      finish();
    }
  });
}

afterAll(async () => {
  await closeCoapAgent(coap.globalAgent);
  await closeCoapAgent(coap.globalAgentIPv6);
});