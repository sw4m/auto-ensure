const vscode = require("vscode");
const Rcon = require("rcon");
const path = require("path");

const MESSAGE_PREFIX = "[FiveM Auto Ensure] ";
const MODE = vscode.workspace.getConfiguration("auto-ensure").get("mode");
const CONFIG = vscode.workspace.getConfiguration("auto-ensure");
const RELOAD_TIMEOUT = CONFIG.get("reloadTimeout") || 0;

let GlobalState; // Global state to store connection history
let RconConnection; // RCON connection object
let StatusBarConnectionItem; // Status bar item for connection status
let doesConnectionExist = false; // Flag to check if connection exists
let isDisconnecting = false; // Flag to check if disconnecting

//////////////////////////////////////////////////////////////////
// Helper functions
//////////////////////////////////////////////////////////////////

//TODO: Hide notifications after 5 seconds
function ShowErrorMessage(message) {
  const notification = vscode.window.showErrorMessage(MESSAGE_PREFIX + message);

}

function ShowInfoMessage(message) {
  const notification = vscode.window.showInformationMessage(MESSAGE_PREFIX + message);
}

// Splitting the IP and port from string
function SplitIpAndPort(ip) {
  return ip.split(":");
}

// Getting the current workspace folder name
function GetCurrentWorkspaceFolderName() {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || !workspaceFolders.length > 0) {
    ShowErrorMessage("No workspace folder is open.");
    return null;
  }

  // Get the first workspace folder
  const currentFolder = workspaceFolders[0];
  return currentFolder.name; // Returns the name of the folder

}

//////////////////////////////////////////////////////////////////
// Status bar item fuctions
//////////////////////////////////////////////////////////////////

//TODO: Refactor and show it when disconnected + icon
function SetupStatusBarItem(context) {
  StatusBarConnectionItem = vscode.window.createStatusBarItem(
    "auto-ensure",
    vscode.StatusBarAlignment.Right,
    100
  );
  StatusBarConnectionItem.text = "Auto Ensure Connected";
  StatusBarConnectionItem.tooltip =
    "Auto ensuring resources. Click to disconnect.";
  StatusBarConnectionItem.command = "auto-ensure.disconnect";

  // Add the status bar item to the context subscriptions
  context.subscriptions.push(StatusBarConnectionItem);
}

function SetStatusBar(status) {
  status ? StatusBarConnectionItem.show() : StatusBarConnectionItem.hide();
}


//////////////////////////////////////////////////////////////////
// Console connection functions
//////////////////////////////////////////////////////////////////

function ConnectConsole({ ip, password }) {
  if (RconConnection) {
    DisconnectConsole();
    return;
  }

  [ip, port] = ip.split(":");

  RconConnection = new Rcon(ip, port, password, {
    tcp: false,
    challenge: false,
  });

  CaptureRconEvents();

  RconConnection.connect();

  // Check the connection
  RconConnection.send("refresh");

  setTimeout(() => {
    if (!isDisconnecting) {
      if (doesConnectionExist) {
        ShowInfoMessage("Connected to server");
        ShowStatusBar(true);
      } else {
        ShowErrorMessage("Connection failed");
        RconConnection.disconnect();
        RconConnection = null;
      }
    }
  }, 5000);

  RconConnection.send("refresh");
  SetStatusBar(true);
}

function DisconnectConsole() {
  if (RconConnection) {
    isDisconnecting = true;
    RconConnection.disconnect();
    RconConnection = null;
    vscode.window.showWarningMessage("Disconnected");
    SetStatusBar(false);
  }
}


//////////////////////////////////////////////////////////////////
// Input functions
//////////////////////////////////////////////////////////////////

function OpenAddConnectionInput() {
  const window = vscode.window;

  // Inputting for IP and Port
  window
    .showInputBox({
      placeHolder: "IP:Port",
      prompt: "Enter server IP and Port",
    })
    .then((ip) => {
      if (!ip) {
        ShowErrorMessage("No connection details provided!");
        return;
      }

      if (SplitIpAndPort(ip).length !== 2) {
        ShowErrorMessage("Invalid IP format! Use 'IP:Port' format.");
        return;
      }

      // Inputting for password
      window
        .showInputBox({
          placeHolder: "Password",
          password: true,
          prompt: "Enter your server RCON password",
        })
        .then((password) => {
          if (!password || !ip) {
            ShowErrorMessage("Incomplete connection details provided!");
            return;
          }

          AddConfigConnection({ ip, password });
          ShowInfoMessage(`Added connection: ${ip}`);
        });
    });
}

function OpenConnectionsList() {
  const configConnections = GetConfigConnections();
  const connectionHistory = GetUniqueConnectionHistory();
  const quickPick = vscode.window.createQuickPick();

  quickPick.items = [
    ...configConnections,
    ...connectionHistory,
    {
      label: "Add Connection",
      description: "Add a new connection",
    },
  ];

  quickPick.placeholder = "Select a connection";
  quickPick.onDidChangeSelection((selection) => {
    const selectedItem = selection[0];
    try {
      if (selectedItem) {
        if (selectedItem.label === "Add Connection") {
          OpenAddConnectionInput();
        } else {
          ConnectConsole(selectedItem);
          AddHistoryConnection(connectionHistory, selectedItem);
        }
      }
      quickPick.hide();
    } catch (error) {
      console.error("Error in Quick Pick selection handler:", error);
    }
  });
  quickPick.show();
}

//////////////////////////////////////////////////////////////////
// Connection lists functions
//////////////////////////////////////////////////////////////////

// History

function AddHistoryConnection(connectionHistory, { ip, password }) {

  if (connectionHistory.length > 5) {
    connectionHistory.splice(0, connectionHistory.length - 5);
    GlobalState.update("connectionHistory", connectionHistory, true);
  }

  GlobalState.update("connectionHistory", [
    ...connectionHistory,
    { label: `${ip}`, ip, password },
  ]);
}

function GetUniqueConnectionHistory() {
  const connectionHistory = GlobalState.get("connectionHistory") || [];

  // Remove duplicates from connectionHistory
  // Add label and description to each valid connection
  const uniqueHistory = connectionHistory.reduce((acc, connection) => {
    if (!acc.some((item) => item.ip === connection.ip)) {
      connection.label = connection.ip;
      connection.description = "History";
      acc.push(connection);
    }
    return acc;
  }, []);

  return uniqueHistory;
}

// Config

function AddConfigConnection(newConnection) {
  const configConnections = CONFIG.get("connectionList") || [];

  configConnections.forEach((connection) => {
    delete connection.label;
    delete connection.description;
  });

  CONFIG.update("connectionList", [...configConnections, newConnection], true);
}

function GetConfigConnections() {
  const configConnections = CONFIG.get("connectionList") || [];

  // Add label and description to each connection
  configConnections.forEach((connection) => {
    connection.label = connection.ip;
    connection.description = "Config";
  });

  return configConnections;
}

//////////////////////////////////////////////////////////////////
// Capturing Events
//////////////////////////////////////////////////////////////////

function CaptureRconEvents() {
  RconConnection
    .on("response", (str) => {
      doesConnectionExist = true;
      if (str.includes("Couldn't find resource")) {
        ShowErrorMessage("Couldn't find resource");
      } else if (str.includes("Invalid password")) {
        isDisconnecting ? DisconnectConsole() : ShowErrorMessage("Invalid password");
      } else {
        if (str.startsWith("rint")) {
          str = str.slice(4);
        }
        ShowInfoMessage(str);
      }
    })
    .on("error", (err) => {
      isDisconnecting ? DisconnectConsole() : ShowErrorMessage("Error: " + err);

    })
    .on("end", () => {
      isDisconnecting ? DisconnectConsole() : ShowErrorMessage("Connection closed")
    });
}

function CaptureSaveEvents() {
  vscode.workspace.onDidSaveTextDocument((document) => {
    if (document.uri.scheme === "file" && RconConnection) {
      const currentFolder = GetCurrentWorkspaceFolderName();
      if (currentFolder) {
        setTimeout(() => {
          RconConnection.send(`refresh; ensure ${currentFolder}`);
        }, RELOAD_TIMEOUT);
      }
    }
  });
}

//////////////////////////////////////////////////////////////////
// MAIN FUNCTION
//////////////////////////////////////////////////////////////////

function activate(context) {
  GlobalState = context.globalState;

  SetupStatusBarItem(context);
  CaptureSaveEvents();

  const OpenListCommand = vscode.commands.registerCommand(
    "auto-ensure.openList",
    OpenConnectionsList
  );

  const DisconnectCommand = vscode.commands.registerCommand(
    "auto-ensure.disconnect",
    DisconnectConsole
  );

  const OpenConfigCommand = vscode.commands.registerCommand(
    "auto-ensure.openConfig",
    () =>{
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:sw4m.auto-ensure');
    }
);

  // Subscriptions
  context.subscriptions.push(OpenListCommand, DisconnectCommand, OpenConfigCommand);
}

function deactivate() {
  if (RconConnection) {
    RconConnection.disconnect();
  }
  if (StatusBarConnectionItem) {
    StatusBarConnectionItem.dispose();
  }
  ShowInfoMessage("Extension deactivated. Reload VScode.");
}

module.exports = {
  activate,
  deactivate,
};
