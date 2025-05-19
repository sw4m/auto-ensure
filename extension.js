const vscode = require("vscode");
const Rcon = require("rcon");
const path = require("path");

const MESSAGE_PREFIX = "[FiveM Auto Ensure] ";
const MODE = vscode.workspace.getConfiguration("auto-ensure").get("mode");
const CONFIG = vscode.workspace.getConfiguration("auto-ensure");
const RELOAD_TIMEOUT = CONFIG.get("reloadTimeout") || 0;

// Ik using global variables is bad but WHAT ARE YOU GONNA DO ABOUT IT
//TODO: refactor to use get functions instead of global variables - maybe use OOP
let GlobalState; // Global state to store connection history
let RconConnection; // RCON connection object
let StatusBarConnectionItem; // Status bar item for connection status
let ReceivedResponse; // For checking connection since capturing has it's own function
let selectedFolders = []; // For selected folders whne using selectedEnsure

//////////////////////////////////////////////////////////////////
// Helper functions
//////////////////////////////////////////////////////////////////

function ShowErrorMessage(message) {
  const notification = vscode.window.showErrorMessage(MESSAGE_PREFIX + message);
}

function ShowInfoMessage(message) {
  const notification = vscode.window.showInformationMessage(
    MESSAGE_PREFIX + message
  );
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
    "Auto ensuring resources. Click to send 'refresh'.";
  StatusBarConnectionItem.command = "auto-ensure.refresh";

  // Add the status bar item to the context subscriptions
  context.subscriptions.push(StatusBarConnectionItem);
}

function SetStatusBar(status) {
  status ? StatusBarConnectionItem.show() : StatusBarConnectionItem.hide();
}

//////////////////////////////////////////////////////////////////
// Console connection functions
//////////////////////////////////////////////////////////////////

async function CheckConnection() {
  // The Rcon library does not have a built-in method to check the connection
  // So we send a command and wait for a response
  if (!RconConnection) {
    return false;
  }

  ReceivedResponse = false;

  RconConnection.send("refresh");
  return await new Promise((resolve) => {
    ShowInfoMessage("Checking connection...");
    setTimeout(() => {
      if (!ReceivedResponse) {
        RconConnection.disconnect();
        RconConnection = null;

        resolve(false);
      } else {
        resolve(true);
      }
    }, 5000);
  });
}

async function ConnectConsole({ ip, password }) {
  if (RconConnection) {
    DisconnectConsole();
  }

  [ip, port] = ip.split(":");
  RconConnection = new Rcon(ip, port, password, {
    tcp: false,
    challenge: false,
  });

  CaptureRconEvents();

  RconConnection.connect();

  if (!(await CheckConnection())) {
    ShowErrorMessage("Connection failed");
    return;
  }

  ShowInfoMessage("Connected to server");
  SetStatusBar(true);
}

function DisconnectConsole() {
  if (RconConnection) {
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
      ShowErrorMessage("Error: " + error);
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
  RconConnection.on("response", (str) => {
    if (!ReceivedResponse) {
      ReceivedResponse = true;
      //Do not show notification when checking connection
      return;
    }
    if (str.startsWith("rint")) {
      str = str.slice(4);
    }

    ShowInfoMessage(str);

  })
    .on("error", (err) => {
      ReceivedResponse = true;
      isDisconnecting ? DisconnectConsole() : ShowErrorMessage("Error: " + err);
    })
    .on("end", () => {
      ReceivedResponse = true;
      isDisconnecting
        ? DisconnectConsole()
        : ShowErrorMessage("Connection closed");
    });
}


function CaptureSaveEvents() {
  vscode.workspace.onDidSaveTextDocument((document) => {
    const refresh = CONFIG.get("autoRefresh");
    if (document.uri.scheme === "file" && RconConnection) {
      switch (MODE) {
        case "workspaceEnsure":
          ensureWorkspace(refresh);
        case "selectedEnsure":
        case "recursiveEnsure":
      }
    }
  });
}


//////////////////////////////////////////////////////////////////
// Functions for different modes
//////////////////////////////////////////////////////////////////

function ensureResources(refresh, resources) {
  setTimeout(() => {
    resource.forEach((key) => {
      RconConnection.send(`${refresh && "refresh;"} ensure ${key}`);
    });
  }, RELOAD_TIMEOUT);
}

//! TODO: Add right click menu for selectedEnsure

function ensureWorkspace(refresh) {
  const currentFolder = GetCurrentWorkspaceFolderName();

  if (!currentFolder) {
    ShowErrorMessage("No workspace folder is open.");
    return;
  }

  ensureResources(refresh, [currentFolder]);

}

function ensureSelected(refresh) {
  if (selectedFolders.length === 0) {
    ShowErrorMessage("No folders selected");
    return;
  }

  ensureResources(refresh, selectedFolders);
}

function ensureRecursive(refresh) {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || !workspaceFolders.length > 0) {
    ShowErrorMessage("No workspace folder is open.");
    return;
  }

  const currentFolder = workspaceFolders[0];

  // This is Claude generated code since/I am lazy
  const folders = vscode.workspace.findFiles(
    new vscode.RelativePattern(currentFolder, "**/{fxmanifest.lua,__resource.lua}")
  ).then((files) => {
    // Get unique parent folder names containing fxmanifest.lua or __resource.lua
    const resourceFolders = [
      ...new Set(files.map((file) => path.basename(path.dirname(file.fsPath))))
    ];
    return resourceFolders;
  });

  ensureResources(refresh, folders);
}



//////////////////////////////////////////////////////////////////
// MAIN FUNCTION
//////////////////////////////////////////////////////////////////

function activate(context) {
  GlobalState = context.globalState;

  SetupStatusBarItem(context);
  CaptureSaveEvents();

  const openListCommand = vscode.commands.registerCommand(
    "auto-ensure.openList",
    OpenConnectionsList
  );

  const disconnectCommand = vscode.commands.registerCommand(
    "auto-ensure.disconnect",
    DisconnectConsole
  );

  const openConfigCommand = vscode.commands.registerCommand(
    "auto-ensure.openConfig",
    () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:sw4m.auto-ensure"
      );
    }
  );

  const refreshCommand = vscode.commands.registerCommand(
    "auto-ensure.refresh",
    () => {
      if (RconConnection) {
        RconConnection.send("refresh");
      } else {
        ShowErrorMessage("No connection established.");
      }
    }
  );

  const selectFolderCommand = vscode.commands.registerCommand(
    "auto-ensure.selecteFolder",
    (selectedFolder) => {
      console.log(selectedFolder);
    }
  );

  // Subscriptions
  context.subscriptions.push(
    openListCommand,
    disconnectCommand,
    openConfigCommand,
    refreshCommand,
    selectFolderCommand
  );
}

function deactivate() {
  if (RconConnection) {
    DisconnectConsole();
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
