import type { Entry } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { repeatNow } from '../../services/entries';
import { toast } from '../../state/ui';

const t = ru.today;

export async function deleteWithUndo(e: Entry) {
  await repos.entries.softDelete(e.id);
  toast({
    text: t.deleted,
    action: { label: ru.common.undo, run: () => repos.entries.restore(e.id) },
  });
}

export async function repeatWithUndo(e: Entry) {
  const c = await repeatNow(repos, e);
  toast({
    text: t.repeated,
    action: { label: ru.common.undo, run: () => repos.entries.softDelete(c.id) },
  });
}
