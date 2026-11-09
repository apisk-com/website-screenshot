# Website screenshot

Working code that takes screenshots of web pages with Playwright and Puppeteer, including full-page captures. Each folder is one complete example: one language and tool, or one
problem. The [APISK tutorials](https://apisk.com/blog/) explain the code step
by step.

## Examples

### By language and tool

| Folder | Language and tools | What it does | Tutorial |
|---|---|---|---|
| [nodejs-playwright](nodejs-playwright/) | Node.js, Express 5, Playwright | Screenshot API: `GET /screenshot` with viewport, scale, PNG, JPEG or WebP, full page, API key and S3 upload | [Build a Website Screenshot API with Node.js and Playwright](https://apisk.com/blog/screenshot-api-nodejs/), 17 November 2026 |

### By problem

| Folder | Language and tools | What it does | Tutorial |
|---|---|---|---|
| [full-page](full-page/) | Playwright, Puppeteer | Full-page screenshots with lazy images, sticky headers and cookie banners | [Full-Page Screenshots: Lazy Images, Sticky Headers, Banners](https://apisk.com/blog/full-page-screenshot/), 9 December 2026 |
| [wait-for-page-ready](wait-for-page-ready/) | Puppeteer, Playwright | Waits for network, fonts, images and app data before a screenshot or a PDF | [Wait Until the Page Is Ready Before a Screenshot or PDF](https://apisk.com/blog/wait-for-page-ready/), 13 January 2027 |

Each folder runs on its own: open its `README.md` for the commands.

## Add an example

Examples for other languages and tools are welcome. Put each one in its own
folder. Name the folder `<language>-<tool>`, for example
`java-openhtmltopdf`, or name it after the problem that it solves. Add a
`test.sh` file that installs what the example needs on Ubuntu 24.04 and runs
its tests. The test workflow runs `test.sh` for each folder that a push or a
pull request changes.

## License

MIT. See [LICENSE](LICENSE).
