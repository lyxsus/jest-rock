# A dummy way to record and replay async functions for jest testing

```
// eslint-disable-next-line
require = require ('@std/esm') (module, {esm: 'js', cjs: true});

const Rock = require ('jest-rock');
const {injectable} = require ('../../../../libs/fetcher');
const Scraper = require ('../scrape').default;

jest.setTimeout (1.5 * 60 * 1000);

describe ('Vendor integration test example', () => {

    test ('Record and replay scraping results to match previously snapshotted result', async () => {
        const url = 'https://www.walmart.com/ip/40605761';
        const recordName = `scrape-product-basic-example-${url}`;
        const recorder = await Rock.record (recordName);

        recorder.intercept (injectable, 'requestWithFetcher');

        const product = await Scraper.product (url);

        expect (product).toMatchSnapshot ();

        await recorder.completeRecording ();

    });

    test ('Record and replay error produced by using incorrect product URL', async () => {
        const url = 'https://www.walmart.com/ip/28583665';
        const recordName = `scrape-product-error-example-${url}`;
        const recorder = await Rock.record (recordName);

        recorder.intercept (injectable, 'requestWithFetcher');

        await expect (
            Scraper.product (url)
        )
            .rejects
            .toThrow ('DOES_NOT_EXISTS');

        await recorder.completeRecording ();
    });
});
```