import { useContext, createSignal, onMount, createEffect } from 'solid-js';

import { ChatContext } from '../ChatContext';
import styles from './Summarize.module.css';
import { parseDocxFileAsync, parseHTMLFileAsync, parseTxtFileAsync, parsePdfFileAsync } from '../../../utils/FileReaders';
import { getCachedModelsNames, cacheModel } from '../../../utils/ModelCache';

// import workerCode from './summarize_worker.js?raw';


function Summarize() {

  const chatContext = useContext(ChatContext);

  const [modelName, setModelName] = createSignal("");
  const [availableModels, setAvailableModels] = createSignal([], {equals: false}); 

  const [tab, setTab] = createSignal("text");
  const [hoveredTab, setHoveredTab] = createSignal(null);

  const [addModelBtnText, setAddModelBtnText] = createSignal("Add Model");

  const [sendDisabled, setSendDisabled] = createSignal(true);

  let worker;

  // Checks the cache for models that can be used for summarization.
  onMount(async () => {
    setAvailableModels(await getCachedModelsNames('summarization'));
  });

  // setup summarize worker upon `modelName` or `processor` signal
  createEffect(() => {
    if (modelName() === "") return;

    if (worker) worker.terminate();
    worker = undefined;

    // const blob = new Blob([workerCode], { type: 'application/javascript' }); // cannot use imports within the worker this way
    // worker = new Worker(URL.createObjectURL(blob));

    // web worker via file path or URL doesn't work as it gets bundled into a separate js file
    worker = new Worker(new URL('./summarize_worker.js', import.meta.url), { type: 'module' });

    worker.onmessage = (e) => {
      switch (e.data.task) {

        case 'loadModel':
          if (e.data.response === 'success') {
            console.log('Successfully loaded pipeline.');
            setSendDisabled(false);
          }
          if (e.data.response === 'failed') {
            console.log('Failed to load summarization model.');
            setModelName('');
            alert('Failed to load model. Please try again, if issues persist try reloading page.');
          }
          setAddModelBtnText("Add Model");
          break;

        case 'inference':
          if (e.data.response === 'failed') {
            chatContext.addMessage('Error: failed to summarise text. Please try again.', false);
          } else {
            chatContext.addMessage(e.data.response);
          }
          setSendDisabled(false);
          break;
      }
    };

    setSendDisabled(true);
    setAddModelBtnText("Loading Model");
    worker.postMessage({task: 'loadModel', model: modelName(), device: chatContext.processor()});
  });

  const addModel = async () => {

    document.getElementById("folderInput").disabled = true;

    setAddModelBtnText("Loading Model");

    let folderElement = document.getElementById("folderInput");
    let files = [...folderElement.files];

    if (files.length == 0) {
      alert("Empty model directory was selected, please select again.");
    }
    else if (!files.find(f => f.name == "browser_config.json")) {
      alert("Unsupported or Malformed Model.")
    }
    else if (JSON.parse(await files.find(f => f.name == "browser_config.json").text()).task != "summarization") {
      alert("Must be a summarisation model. browser_config.json states that the model is for a different task.");
    }
    else {
      let model = await cacheModel(files);

      // add model to list of available models
      let models = availableModels().slice();
      models.push(model);

      setAvailableModels(models);
      setModelName(model);
    }
    
    document.getElementById("folderInput").disabled = false;
  };

  const summarizeTextInput = async () => {

    if (modelName() == "" || !worker) {
      alert("A model must be selected before summarising text. Please select a model.");
      return;
    }

    setSendDisabled(true);

    let inputTextArea = document.getElementById("inputTextArea");
    let userMessage = inputTextArea.value;

    if (userMessage == "") return;

    chatContext.addMessage("Summarise: " + userMessage, true);
    inputTextArea.value = "";

    worker.postMessage({task: 'inference', text: userMessage});
  };

  const summarizeFileInput = async () => {

    if (modelName() == "" || !worker) {
      alert("A model must be selected before summarising text. Please select a model.");
      return;
    }

    setSendDisabled(true);

    let fileInput = document.getElementById("fileInput");
    let file = fileInput.files[0];

    let fileContent = "";
    try {
      if (file.name.endsWith('.txt')) {
        fileContent = await parseTxtFileAsync(file);
      } else if (file.name.endsWith('.html')) {
        fileContent = await parseHTMLFileAsync(file);
      } else if (file.name.endsWith('.docx')) {
        fileContent = await parseDocxFileAsync(file);
      } else if (file.name.endsWith('.pdf')) {
        fileContent = await parsePdfFileAsync(file);
      } else {
        alert("Unsupported file type. Please use .txt, .html, .docx, or .pdf files.");
        fileInput.value = null;
        return;
      }
    } catch (error) {
      console.error("Error parsing file:", error);
      alert("Error processing file.");
      fileInput.value = null;
      return;
    }

    chatContext.addMessage("Summarise File: " + file.name, true);
    chatContext.addFile(fileContent, file.name);

    worker.postMessage({task: 'inference', text: fileContent});

    fileInput.value = null;  // clear file input element
  };

  return (
    <>
      <div class={styles.inputContainer}>

        {/* Dynamic input UI - moved to top */}
        <Switch>
          <Match when={tab() === "text"}>
            <div class={styles.searchBarContainer}>
              <textarea id="inputTextArea" 
                placeholder='Enter text to summarise here...'
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    summarizeTextInput();
                  }
                }}
              ></textarea>
            </div>
          </Match>
          <Match when={tab() === "file"}>
            <div style="margin-top:2vh;margin-left:2vh;">
              <input type="file" id="fileInput" accept=".txt, .html, .docx, .pdf" />
            </div>
          </Match>
        </Switch>

        {/* Control buttons row */}
        <div class={styles.controlsContainer}>

          {/* text or file tab switcher */}
          <div class={styles.controlsLeft}>
            <button 
              class={`${tab() === "file" ? styles.selectedTab : styles.tab} ${hoveredTab() === "file" ? styles.highlighted : ''}`}
              onClick={() => setTab("file")}
              onMouseEnter={() => setHoveredTab("file")}
              onMouseLeave={() => setHoveredTab(null)}
            >
              Summarise File
            </button>
            <button 
              class={`${tab() === "text" ? styles.selectedTab : styles.tab} ${hoveredTab() === "text" ? styles.highlighted : ''}`}
              onClick={() => setTab("text")}
              onMouseEnter={() => setHoveredTab("text")}
              onMouseLeave={() => setHoveredTab(null)}
            >
              Summarise Text
            </button>
          </div>

          {/* model selection and submit button */}
          <div class={styles.controlsRight}>

            <select 
              class={styles.modelSelection} 
              value={modelName()}
              onChange={e => setModelName(e.currentTarget.value)}
            >
              <option value="">Select Model</option>
              <For each={availableModels()}>{(model) => 
                <option value={model}>{model}</option>
              }</For>
            </select>

            <label 
              for="folderInput" 
              class={availableModels().length == 0 ? styles.noModels : styles.addModelButton}
            >
              {addModelBtnText()}
            </label>
            <input type="file" id="folderInput" class="hidden" webkitdirectory multiple onChange={addModel} />
            <button 
              id="sendButton" 
              class={`${styles.sendButton} ${sendDisabled() ? styles.disabledSendButton : ""}`}
              onClick={() => {tab() == "text" ? summarizeTextInput() : summarizeFileInput()}} 
              disabled={sendDisabled()}
            >
              Send
            </button>

          </div>

        </div>

      </div>
    </>
  );
}

export default Summarize;
