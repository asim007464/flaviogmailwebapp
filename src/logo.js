/**
 * 6.0 wordmark as HTML + inline CSS (no image — works in Gmail & preview).
 * Black italic "6." + green italic slashed "0" (#03ae75 from LogoBlack.svg).
 */
export function getLogoHtml() {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
  <tr>
    <td style="font-family:Helvetica,Arial,sans-serif;font-size:44px;font-weight:800;font-style:italic;color:#2c3a44;line-height:1;letter-spacing:-4px;padding:0;">6</td>
    <td style="font-family:Helvetica,Arial,sans-serif;font-size:44px;font-weight:800;font-style:italic;color:#2c3a44;line-height:1;padding:0 1px 0 0;">.</td>
    <td style="padding:0 0 0 4px;vertical-align:middle;line-height:1;">
      <span style="display:inline-block;position:relative;width:34px;height:44px;vertical-align:middle;">
        <span style="font-family:Helvetica,Arial,sans-serif;font-size:44px;font-weight:800;font-style:italic;color:#03ae75;line-height:44px;display:inline-block;position:relative;z-index:1;">0</span>
        <span style="position:absolute;left:3px;top:19px;width:30px;height:0;border-top:3px solid #03ae75;font-size:1px;line-height:1px;display:block;transform:rotate(-32deg);-webkit-transform:rotate(-32deg);-ms-transform:rotate(-32deg);z-index:2;">&nbsp;</span>
      </span>
    </td>
  </tr>
</table>`.trim();
}
