import { describe, expect, it } from 'vitest';
import { campaignTitle } from './dedication';

describe('campaignTitle', () => {
  it('names a campaign by its dedication and the name as typed', () => {
    expect(campaignTitle('ilui_nishmas', 'Naftali ben Yaakov')).toBe("L'ilui nishmas: Naftali ben Yaakov");
    expect(campaignTitle('refuah_shleima', 'חיה בת דוד')).toBe('Refuah shleima: חיה בת דוד');
    expect(campaignTitle('zechus', 'Sarah')).toBe('Zechus: Sarah');
    expect(campaignTitle('other', 'Sarah')).toBe('In honor of: Sarah');
  });
});
