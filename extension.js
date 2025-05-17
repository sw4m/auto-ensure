const vscode = require("vscode");
const Rcon = require("rcon");
const path = require("path");

const MODE = vscode.workspace.getConfiguration("auto-ensure").get("mode");

let rconConnection;
let vscodeWorkspaceState;
let statusBarConnectionItem;
let reloadTimeout = 0;

let infoPrefix = "[FiveM Auto Ensure] ";

// Helper functions for showing VSCode messages
function showErrorMessage(message) {
  vscode.window.showErrorMessage(infoPrefix + message);
}

function showInfoMessage(message) {
  vscode.window.showInformationMessage(infoPrefix + message);
}

function getCurrentWorkspaceFolderName() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    // Get the first workspace folder
    const currentFolder = workspaceFolders[0];
    return currentFolder.name; // Returns the name of the folder
  } else {
    vscode.window.showErrorMessage("No workspace folder is open.");
    return null;
  }
}

function setupStatusBarItem(context) {
  statusBarConnectionItem = vscode.window.createStatusBarItem(
    "auto-ensure",
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarConnectionItem.text = "Auto Ensure Connected";
  statusBarConnectionItem.tooltip =
    "Auto ensuring resources. Click to disconnect.";
  statusBarConnectionItem.command = "auto-ensure.disconnect";

  // Add the status bar item to the context subscriptions
  context.subscriptions.push(statusBarConnectionItem);
}

function addConnectionHistory(globalState, connectionHistory, { ip, password }) {
  if (connectionHistory.length > 5) {
    connectionHistory.splice(0, connectionHistory.length - 5);
    globalState.update("connectionHistory", connectionHistory, true);
  }
  globalState.update("connectionHistory", [
    ...connectionHistory,
    { label: `${ip}`, ip, password },
  ]);
}

function addConnection(configConnectionsPointer, configConnections) {
  vscode.window
    .showInputBox({
      placeHolder: "IP:Port",
      prompt: "Enter server IP and Port",
    })
    .then((ip) => {
      if (ip) {
        if (ip.split(":").length !== 2) {
          showErrorMessage("Invalid IP format! Use 'IP:Port' format.");
          return;
        }

        vscode.window
          .showInputBox({
            placeHolder: "password",
            password: true,
            prompt: "Enter your server RCON password",
          })
          .then((password) => {
            if (password && ip) {
              const newConnection = {
                label: ip,
                password,
                ip,
              };
              configConnectionsPointer.update(
                "connectionList",
                [...configConnections, newConnection],
                true
              );
              showInfoMessage(`Added connection: ${ip}`);
            } else {
              showErrorMessage("Incomplete connection details provided!");
            }
          });
      } else {
        console.error(ip);
        showErrorMessage("No connection details provided!");
      }
    });
}


function activate(context) {
  const globalState = context.globalState;

  const workspaceState = context.workspaceState;
  vscodeWorkspaceState = workspaceState;

  setupStatusBarItem(context);

  // Event: Save Text Document
  vscode.workspace.onDidSaveTextDocument((document) => {
    if (document.uri.scheme === "file" && rconConnection) {
      const currentFolder = getCurrentWorkspaceFolderName();

      setTimeout(() => {
        rconConnection.send(`refresh; ensure ${currentFolder}`);
      }, reloadTimeout);
    }
  });

  let connectCommand = vscode.commands.registerCommand(
    "auto-ensure.openList",
    async function () {
      const configConnectionsPointer =
        vscode.workspace.getConfiguration("auto-ensure");

      const configConnections =
        configConnectionsPointer.get("connectionList")  || [];

      configConnections.forEach((connection) => {
        connection.label = connection.ip;
        connection.description = "Config";
      });

      const connectionHistory = globalState.get("connectionHistory") || [];

      // Remove duplicates from connectionHistory
      const uniqueHistory = connectionHistory.reduce((acc, connection) => {
        if (!acc.some((item) => item.ip === connection.ip)) {
          acc.push(connection);
        }
        return acc;
      }, []);

      uniqueHistory.forEach((connection) => {
        connection.label = connection.ip;
        connection.description = "History";
      });

      const quickPick = vscode.window.createQuickPick();

      quickPick.items = [
        ...configConnections,
        ...uniqueHistory,
        {
          label: "Add Connection",
          description: "Add a new connection",
          ip: "ano ano",
        },
      ];

      quickPick.placeholder = "Select a connection";
      quickPick.onDidChangeSelection((selection) => {
        const selectedItem = selection[0];
        try {
          if (selectedItem) {
            if (selectedItem.label === "Add Connection") {
              addConnection(
                configConnectionsPointer,
                configConnections,
                uniqueHistory
              );
            } else {
              connectConsole(selectedItem);
              addConnectionHistory(globalState, uniqueHistory, selectedItem);
              showInfoMessage(`Connected to ${selectedItem.label}`);
            }
          }
          quickPick.hide();
        } catch (error) {
          console.error("Error in Quick Pick selection handler:", error);
        }
      });
      quickPick.show();
    }
  );

  // Command: Disconnect
  let disconnectCommand = vscode.commands.registerCommand(
    "auto-ensure.disconnect",
    disconnectConsole
  );

  function disconnectConsole() {
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
        showInfoMessage("Authenticated");
      })
      .on("response", (str) => {
        if (str.includes("Couldn't find resource")) {
          showErrorMessage("Couldn't find resource");
        } else if (str === "Invalid password") {
          showErrorMessage("Invalid password");
        } else {
          showInfoMessage(str);
        }
      })
      .on("error", (err) => {
        showErrorMessage(`Error: ${err}`);
      })
      .on("end", () => {
        showErrorMessage("Connection closed");
      });
  }

  function connectConsole({ ip, password }) {
    if (rconConnection) {
      vscode.window.showWarningMessage(
        "Disconnecting before connecting to a new server..."
      );
      disconnectConsole();
      return;
    }

    [ip, port] = ip.split(":");

    rconConnection = new Rcon(ip, port, password, {
      tcp: false,
      challenge: false,
    });

    handleRconEvents();
    rconConnection.connect();
    setConnectionStatus(true);

    vscodeWorkspaceState.update("auto-ensure-connection", {
      password,
      ip,
    });
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

  function setConnectionStatus(status) {
    if (status) {
      statusBarConnectionItem.show();
    } else {
      statusBarConnectionItem.hide();
    }
  }
  // Subscriptions
  context.subscriptions.push(connectCommand, disconnectCommand);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
