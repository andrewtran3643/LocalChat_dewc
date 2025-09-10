import { pipeline, env, SummarizationPipeline } from "@huggingface/transformers";


env.useBrowserCache = true;
env.allowRemoteModels = true;

let summarizer;

self.onmessage = async (e) => {
  switch (e.data.task) {

    case "loadModel":
      const { model , device } = e.data;
      try {
        summarizer = await pipeline('summarization', model, { device });
        self.postMessage({task: "loadModel", response: "success"});
      } catch (e) {
        self.postMessage({task: "loadModel", response: "failed"});
      }
      break;

    case "inference":
      const { text } = e.data;
      try {
        let output = await summarizer(text);
        self.postMessage({task: "inference", response: output[0].summary_text});
      } catch (e) {
        self.postMessage({task: "inference", response: "failed"})
      }
      break;

    default:
      throw new Error("Logic Error: incorrect use of summarize worker");
  }
};
