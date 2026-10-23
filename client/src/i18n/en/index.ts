import { common } from './common';
import { ui } from './ui';
import { errors } from './errors';
import { format } from './format';
import { layout } from './layout';
import { auth } from './auth';
import { dashboard } from './dashboard';
import { lists } from './lists';
import { items } from './items';
import { locations } from './locations';
import { settings } from './settings';
import { extras } from './extras';
import { legal } from './legal';

export const en = { ...common, ...ui, ...errors, ...format, ...layout, ...auth, ...dashboard, ...lists, ...items, ...locations, ...settings, ...extras, ...legal } as const;
