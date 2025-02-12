import * as path from 'path';
import { workspace, ExtensionContext, window } from 'vscode';
import { spawnSync } from 'child_process';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export async function get_client(context: ExtensionContext): Promise<LanguageClient> {
    let clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'erlang' }],
        synchronize: {
            fileEvents: [
                workspace.createFileSystemWatcher('**/rebar.config'),
                workspace.createFileSystemWatcher('**/rebar.lock')
            ]
        },
        middleware: {
            executeCommand: async (command, args, next) => {
                //Ask for user input if the argument contains {user_input: {type: string, text? : string}}
                //Used by Wrangler
                if (command.split(':').length >= 2
                    && command.split(':')[1].startsWith("wrangler-")
                    && args.length >= 1 
                    && "user_input" in args[0] 
                    && "type" in args[0].user_input) 
                {
                    var input: string;
                    switch (args[0].user_input.type) {
                        case "variable":
                            input = await window.showInputBox({
                                placeHolder: args[0].user_input.text ?? "New name", validateInput: (value) => {
                                    if (!/^[A-Z][\_a-zA-Z0-9\@]*$/.test(value)) {
                                        return "Name must be a valid Erlang variable name";
                                    }
                                    return null;
                                }
                            });
                            break;
                        case "atom":
                            input = await window.showInputBox({
                                placeHolder: args[0].user_input.text ?? "New name", validateInput: (value) => {
                                    if (!(/^[a-z][\_a-zA-Z0-9\@]*$/.test(value) || /^[\'][\_a-zA-Z0-9\@]*[\']$/.test(value))) {
                                        return "Name must be a valid Erlang atom";
                                    }
                                    return null;
                                }
                            });
                            break;
                        case "macro":
                            input = await window.showInputBox({
                                placeHolder: args[0].user_input.text ?? "New name", validateInput: (value) => {
                                    if (!(/^[\_a-zA-Z0-9\@]+$/.test(value))) {
                                        return "Name must be a valid Erlang macro name";
                                    }
                                    return null;
                                }
                            });
                            break;
                        case "file":
                            const uri = await window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false });
                            if (uri !== undefined) {
                                input = uri[0].fsPath;
                            }
                            break;
                        default:
                            window.showErrorMessage("Unknown user input type: " + args[0].user_input.type);
                            break;
                    }
                    args = args.slice(0);
                    if (input !== undefined) {
                        args[0].user_input.value = input;
                    } else {
                        //abort execution
                        return;
                    }
                };
                return next(command, args);
            }
        }
    };

    let serverPath = workspace.getConfiguration('erlang_ls').serverPath;
    if (serverPath === "") {
        serverPath = context.asAbsolutePath(
            path.join('erlang_ls', '_build', 'default', 'bin', 'erlang_ls')
        );
    };

    let logLevel = workspace.getConfiguration('erlang_ls').logLevel;

    let serverArgs = [ serverPath, "--log-level", logLevel ];

    let logPath = workspace.getConfiguration('erlang_ls').logPath;
    if (logPath !== "") {
        serverArgs.push("--log-dir", logPath);
    }

    let escriptCmd = workspace.getConfiguration('erlang_ls').escriptPath;
    if (escriptCmd == "") {
        escriptCmd = "escript";
    }
    
    let serverOptions: ServerOptions = {
        command: escriptCmd,
        args: serverArgs,
        transport: TransportKind.stdio
    };

    verifyExecutable(serverPath, escriptCmd);

    return new LanguageClient(
        'erlang_ls',
        'Erlang LS',
        serverOptions,
        clientOptions
    );
}

export function verifyExecutable(serverPath: string, escriptCmd:string) {
    const res = spawnSync(escriptCmd, [serverPath, "--version"]);
    if (res.status !== 0) {
        window.showErrorMessage('Could not start Language Server. Error: ' + res.stdout);
    }
}
