const vscode = require("vscode");
const Rcon = require("rcon");
const path = require("path");

let rconConnection;
let currentFolder;

function showErrorMessage(message) {
  vscode.window.showErrorMessage(message);
}

function showInfoMessage(message) {
  vscode.window.showInformationMessage(message);
}

function disconnectFromServer() {
  if (rconConnection) {
    rconConnection.disconnect();
    rconConnection = null;
    vscode.window.showWarningMessage("Disconnected");
  }
}

function handleRconEvents() {
  rconConnection
    .on("auth", () => {
      console.log("Authenticated");
      rconConnection.send("refresh");
    })
    .on("response", (str) => {
      console.log(str);
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
}

function safeConnect(password, ip, port) {
  if (rconConnection) {
    vscode.window.showWarningMessage("Already connected. Disconnect first.");
    return;
  }
  connectToServer(password, ip, port);
  vscode.workspaceState.update("fivem-devbridge-connection", { password, ip, port });
}

function connectToSaved() {
  const savedConnection = vscode.workspaceState.get("fivem-devbridge-connection");
  if (!savedConnection) {
    showErrorMessage("No saved connection found.");
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
    currentFolder = folder;
    showInfoMessage(`Set ${folderName} as the current resource.`);
  } else {
    showErrorMessage("Please connect to a server first.");
  }
}

function activate(context) {
  // Check for saved connection at startup
  const workspaceState = context.workspaceState;

  // Retrieve the saved connection from the workspaceState
  const savedConnection = workspaceState.get("fivem-devbridge-connection", null);

  if (savedConnection) {
    vscode.window.showInformationMessage("Found saved FiveM connection. Use 'Connect to Saved Connection' to connect.", "Connect")
      .then(selection => {
        if (selection === "Connect") {
          connectToSaved();
        }
      });
  }

  // Event: Save Text Document
  vscode.workspace.onDidSaveTextDocument((document) => {
    if (document.uri.scheme === "file" && rconConnection) {
      if (currentFolder) {
        rconConnection.send(`refresh ${currentFolder.name}`);
        rconConnection.send(`ensure ${currentFolder.name}`);
      } else {
        vscode.workspace.workspaceFolders.forEach((folder) => {
          rconConnection.send(`refresh ${folder.name}`);
          rconConnection.send(`ensure ${folder.name}`);
        });
      }
    }
  });

  // Command: Connect
  let connectCommand = vscode.commands.registerCommand('fivem-devbridge.connect', async function () {
    const password = await vscode.window.showInputBox({ placeHolder: "password", prompt: "Your server RCON password" });
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
    let [ip, port] = connectionDetails.split(":");
    const password = await vscode.window.showInputBox({ placeHolder: "password", prompt: "Your server RCON password" });

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

  // Subscriptions
  context.subscriptions.push(
    connectCommand,
    disconnectCommand,
    customConnectCommand,
    connectSavedCommand,
    setCurrentResourceCommand
  );
  console.log('FiveM DevBridge is now active!');
}

function deactivate() { }

module.exports = {
  activate,
  deactivate
};
