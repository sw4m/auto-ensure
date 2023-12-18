# FiveM DevBridge README

[FiveM DevBridge](https://marketplace.visualstudio.com/items?itemName=ZerX.fivem-devbridge) is a powerful extension for Visual Studio Code that streamlines the development process for FiveM resources. With the ability to ensure all opened folders as resources via RCON, FiveM DevBridge offers a seamless bridge between your code and your FiveM server.

## Features

- **Automatic & Manual Connection**: Connect to your FiveM server effortlessly. The auto-connect feature connects to a local host without requiring you to input the IP and port.
- **Safe Connection**: Ensures you don't accidentally override an existing connection.
- **Saved Connection**: Remembers your last connection details for quicker reconnections.
- **Context Menu Integration**: Right-click on a folder in VS Code's explorer to set it as the current resource on the FiveM server.

## How to Use

1. **Server Configuration**: 
   - Add the line `rcon_password [YOUR_PASSWORD]` in your FiveM server's `server.cfg` file.

2. **Commands**:
   - **Auto Connect**: Use the `fivem connect` command to automatically connect to a localhost server on port 30120. You'll be prompted for the RCON password.
   - **Custom Connect**: Use the `fivem custom connect` command to connect to a custom IP and port. You'll be prompted for the IP, port, and RCON password.
   - **Disconnect**: Use the `fivem disconnect` command to disconnect from any previously connected server.
   - **Set reload delay**: Set a delay for the reload to give a file watcher some time to build your Resource before reloading it.

## Additional Resources

- Learn more about RCON and its integration with FiveM:
  - [FiveM RCON Documentation](https://docs.fivem.net/docs/server-manual/server-commands/#rcon_password-password)
  - [What is RCON?](https://wiki.vg/RCON#:~:text=RCON%20is%20a%20protocol%20that,Source%20RCON%20protocol%20for%20Minecraft.)

**Enjoy your enhanced FiveM development experience with FiveM DevBridge!**
