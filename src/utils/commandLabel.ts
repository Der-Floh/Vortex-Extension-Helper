import { MANIFEST } from '../constants';

/** The title a command palette shows for a contributed command, such as `Vortex: Create Missing Files` */
export function commandLabel(command: string): string {
    const contribution = MANIFEST.contributes.commands.find(candidate => candidate.command === command);
    return contribution ? `${contribution.category}: ${contribution.title}` : command;
}
