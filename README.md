IN DEVELOPMENT, NOT SAFE TO USE

# VScode FiveM Auto Ensure

[FiveM DevBridge](https://marketplace.visualstudio.com/items?itemName=ZerX.fivem-devbridge) is a Fork of [FiveM DevBridge](https://github.com/ZerXGIT/fivem-devbridge), extension that enables ensuring resources you are working on.

## Features

- **Default localhost connection**: Connect to localhost with one click.
- **Saved Connection**: Remembers your connections.
- **Ensuring modes**:
   1. Save workspace resource - saves the resource you're currently editing by getting the workspace folder name
   2. Save selected resources - enables you to select multiple resources that will all get ensured upon saving
   3. Save all resources in workspace - recursivelly gets the names of all the resources in the current workspace and ensures them upon saving any file


## How to Use

1. **Server Configuration**: 
   - Add the line `rcon_password [YOUR_PASSWORD]` in your FiveM server's `server.cfg` file - [FiveM RCON Documentation](https://docs.fivem.net/docs/server-manual/server-commands/#rcon_password-password).

2. **Commands**:
   - **\[FiveM Auto Ensure\] Connect**: Opens a list of connections with the option to add a connection.
   - **\[FiveM Auto Ensure\] Disconnect**: Disconnects the active connection.
   - **\[FiveM Auto Ensure\] Open Config File**: Opens the config file of the extension.

## Config

### Connection Mode
   1. Save workspace resource - saves the resource you're currently editing by getting the workspace folder name
   2. Save selected resources - enables you to select multiple resources that will all get ensured upon saving
   3. Save all resources in workspace - recursivelly gets the names of all the resources in the current workspace and ensures them upon saving any file

### Connections
- Saved connections

### Save Delay
- Delay after saving for resources that need to be built first
