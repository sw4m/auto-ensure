const vscode = require("vscode");
const Rcon = require("rcon");
const path = require("path");

let conn;

function showErrorMessage(message) {
  vscode.window.showErrorMessage(message);
}

function showInfoMessage(message) {
  vscode.window.showInformationMessage(message);
}

function disconnectFromServer() {
  if (conn) {
    conn.disconnect();
    conn = null;
    vscode.window.showWarningMessage("Disconnected");
  }
}

function handleRconEvents() {
  conn
    .on("auth", () => {
      console.log("Authenticated");
      conn.send("refresh");
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
  conn = new Rcon(ip, port, password, { tcp: false, challenge: false });
  handleRconEvents();
  conn.connect();
}

function safeConnect(password, ip, port) {
  if (conn) {
    vscode.window.showWarningMessage("Already connected. Disconnect first.");
    return;
  }
  connectToServer(password, ip, port);
  vscode.workspaceState.update("easy-fivem-connection", { password, ip, port });
}

function connectToSaved() {
  const savedConnection = vscode.workspaceState.get("easy-fivem-connection");
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
  if (conn) {
    conn.send(`ensure ${folderName}`);
    showInfoMessage(`Set ${folderName} as the current resource.`);
  } else {
    showErrorMessage("Please connect to a server first.");
  }
}

function activate(context) {
  // Check for saved connection at startup
  const savedConnection = vscode.workspaceState.get("easy-fivem-connection");
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
    if (document.uri.scheme === "file" && conn) {
      vscode.workspace.workspaceFolders.forEach((folder) => {
        conn.send(`ensure ${folder.name}`);
      });
    }
  });

  // Command: Connect
  let connectCommand = vscode.commands.registerCommand('easy-fivem.connect', async function () {
    const password = await vscode.window.showInputBox({ placeHolder: "password", prompt: "Your server RCON password" });
    if (password) {
      safeConnect(password);
    } else {
      showErrorMessage("No valid password provided!");
    }
  });

  // Command: Disconnect
  let disconnectCommand = vscode.commands.registerCommand('easy-fivem.disconnect', disconnectFromServer);

  // Command: Custom Connect
  let customConnectCommand = vscode.commands.registerCommand('easy-fivem.customConnect', async function () {
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
  let connectSavedCommand = vscode.commands.registerCommand('easy-fivem.connectSaved', connectToSaved);

  // Command: Set Current Resource
  let setCurrentResourceCommand = vscode.commands.registerCommand('easy-fivem.setCurrentResource', setCurrentResource);

  // Subscriptions
  context.subscriptions.push(
    connectCommand,
    disconnectCommand,
    customConnectCommand,
    connectSavedCommand,
    setCurrentResourceCommand
  );
}

function deactivate() { }

module.exports = {
  activate,
  deactivate
};
