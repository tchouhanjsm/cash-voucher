/*******************************************************
 * FILE: 00_WebApp.gs
 *******************************************************/


/**
 * Web App entry point.
 */
function doGet() {

  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle(
      'Hotel Garh Jaisal Haveli - Cash Voucher'
    )
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    );

}


/**
 * Include HTML partial.
 */
function include(filename) {

  return HtmlService
    .createHtmlOutputFromFile(filename)
    .getContent();

}