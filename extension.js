const vscode = require("vscode");
const Rcon = require("rcon");
const path = require("path");

let rconConnection;
let currentFolder;
let vscodeWorkspaceState;
let statusBarConnectionItem;
let reloadTimeout = 0;

let infoPrefix = "[FiveM DevBridge] ";


function showErrorMessage(message) {
  vscode.window.showErrorMessage("[FiveM DevBridge] " + message);
}

function showInfoMessage(message) {
  vscode.window.showInformationMessage("[FiveM DevBridge] " + message);
}

function disconnectFromServer() {
  if (rconConnection) {
    rconConnection.disconnect();
    rconConnection = null;
    vscode.window.showWarningMessage("Disconnected");
    setConnectionStatus(false);
  }
}

function handleRconEvents() {
  rconConnection
    .on("auth", () => {
      console.log("Authenticated");
    })
    .on("response", (str) => {
      if (str.includes("Couldn't find resource")) {
        showErrorMessage("Couldn't find resource");
      }

      if (str === "rint Invalid password") {
        showErrorMessage("Invalid password");
      }
      if (str.includes("rint ^2Scanning resources.^7")) {
        showInfoMessage("Connected");
      }
    })
    .on("error", (err) => {
      showErrorMessage(`Error: ${err}`);
    })
    .on("end", () => {
      showErrorMessage("Connection closed");
      process.exit();
    });
}

function connectToServer(password, ip = "127.0.0.1", port = "30120") {
  disconnectFromServer();
  rconConnection = new Rcon(ip, port, password, { tcp: false, challenge: false });
  handleRconEvents();
  rconConnection.connect();
  setConnectionStatus(true);
}

function safeConnect(password, ip, port) {
  if (rconConnection) {
    vscode.window.showWarningMessage("Already connected. Disconnect first.");
    return;
  }
  connectToServer(password, ip, port);

  vscodeWorkspaceState.update("fivem-devbridge-connection", { password, ip, port });
}

function connectToSaved() {
  const savedConnection = vscodeWorkspaceState.get("fivem-devbridge-connection");
  if (!savedConnection) {
    showErrorMessage("No saved connection found. Please connect manually.");
    vscode.commands.executeCommand('fivem-devbridge.connect');
    return;
  }
  safeConnect(savedConnection.password, savedConnection.ip, savedConnection.port);
}

function setCurrentResource(folder) {
  if (!folder || !folder.fsPath) {
    showErrorMessage("Invalid resource folder selected!");
    return;
  }
  const folderName = path.basename(folder.fsPath);
  if (rconConnection) {
    currentFolder = folderName;
    showInfoMessage(`Set ${folderName} as the current resource.`);
  } else {
    showErrorMessage("Please connect to a server first.");
  }
}

function toggleConnection() {
  if (rconConnection) {
    disconnectFromServer();

  } else {
    connectToSaved();

  }
}

function setConnectionStatus(status) {
  if (status) {
    statusBarConnectionItem.text = '$(custom-icon) Disconnect';
    statusBarConnectionItem.tooltip = 'Click to disconnect';
  } else {
    statusBarConnectionItem.text = '$(custom-icon) Connect';
    statusBarConnectionItem.tooltip = 'Click to connect';
  }
}


function activate(context) {
  // Check for saved connection at startup
  const workspaceState = context.workspaceState;
  vscodeWorkspaceState = workspaceState;

  statusBarConnectionItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarConnectionItem.text = '$(custom-icon) Connect';
  statusBarConnectionItem.tooltip = 'Click to connect';
  statusBarConnectionItem.command = 'fivem-devbridge.toggleConnection';
  statusBarConnectionItem.show();

  // Add the status bar item to the context subscriptions
  context.subscriptions.push(statusBarConnectionItem);

  // Retrieve the saved connection from the workspaceState
  const savedConnection = workspaceState.get("fivem-devbridge-connection", null);


  if (savedConnection) {
    showInfoMessage(`Found saved connection: ${savedConnection.ip}:${savedConnection.port}`);
    connectToSaved();
  }

  // Event: Save Text Document 
  // TODO: Only restart script if the saved file is in the current resource folder
  vscode.workspace.onDidSaveTextDocument((document) => {
    if (document.uri.scheme === "file" && rconConnection) {

      if (currentFolder) {
        setTimeout(() => {
          rconConnection.send(`refresh; ensure ${currentFolder}`);
        }, reloadTimeout);

      } else {
        vscode.workspace.workspaceFolders.forEach((folder) => {
          setTimeout(() => {
            rconConnection.send(`refresh; ensure ${folder.name}`);
          }, reloadTimeout);
        });
      }
    }
  });

  // Command: Connect
  let connectCommand = vscode.commands.registerCommand('fivem-devbridge.connect', async function () {
    const password = await vscode.window.showInputBox({ placeHolder: "password", password: true, prompt: "Your server RCON password" });
    if (password) {
      safeConnect(password);
    } else {
      showErrorMessage("No valid password provided!");
    }
  });

  // Command: Disconnect
  let disconnectCommand = vscode.commands.registerCommand('fivem-devbridge.disconnect', disconnectFromServer);

  // Command: Custom Connect
  let customConnectCommand = vscode.commands.registerCommand('fivem-devbridge.customConnect', async function () {
    let connectionDetails = await vscode.window.showInputBox({ placeHolder: "ip:port", prompt: "Your server IP and port" });
    if (!connectionDetails) {
      showErrorMessage("No connection details provided!");
      return;
    }
    let [ip, port] = connectionDetails.split(":");
    const password = await vscode.window.showInputBox({ placeHolder: "password", password: true, prompt: "Your server RCON password" });

    if (password && ip && port) {
      safeConnect(password, ip, port);
    } else {
      showErrorMessage("Incomplete connection details provided!");
    }
  });

  // Command: Connect to Saved
  let connectSavedCommand = vscode.commands.registerCommand('fivem-devbridge.connectSaved', connectToSaved);

  // Command: Set Current Resource
  let setCurrentResourceCommand = vscode.commands.registerCommand('fivem-devbridge.setCurrentResource', setCurrentResource);

  // Command: Toggle Connection
  let toggleConnectionCommand = vscode.commands.registerCommand('fivem-devbridge.toggleConnection', toggleConnection);

  // Command: Set Reload Timeout
  let setReloadCommand = vscode.commands.registerCommand("fivem-devbridge.setReloadTimeout", async function() {
    let timeout = await vscode.window.showInputBox({placeHolder: "2000", prompt: "Sleep time in MS"});
    if (!timeout) {
      showErrorMessage("Aborting set Timeout.");
      return;
    }

    reloadTimeout = timeout;
  });

  // Subscriptions
  context.subscriptions.push(
    connectCommand,
    toggleConnectionCommand,
    disconnectCommand,
    customConnectCommand,
    connectSavedCommand,
    setCurrentResourceCommand,
    setReloadCommand
  );
}

function deactivate() { }

module.exports = {
  activate,
  deactivate
};
