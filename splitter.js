class FileSplitter {

    constructor(
        file,
        outputDirectory,
        maxSizeMB,
        regex,
        mode,
        progressCallback,
        encoding,
        replaceFrom,   // NEW: character/string to replace
        replaceTo      // NEW: character/string to replace it with
    ) {

        this.file = file;
        this.outputDirectory = outputDirectory;

        this.maxBytes = maxSizeMB * 1024 * 1024;

        this.mode = mode;
        this.progressCallback = progressCallback;

        this.cancelled = false;

        this.fileIndex = 1;
        this.currentSize = 0;
        this.totalRead = 0;

        this.headerLine = null;

        try {
            this.regex = regex ? new RegExp(regex) : null;
        }
        catch (e) {
            throw new Error("Invalid regex.");
        }

        this.encoding =
            encoding === "ascii"
                ? "ascii"
                : "windows-1252";

        this.decoder = new TextDecoder(this.encoding, {
            fatal: false,
            ignoreBOM: true
        });

        // TextEncoder in browsers always writes UTF-8 bytes.
        this.encoder = new TextEncoder();

        // NEW: replacement settings (empty string disables replacement)
        this.replaceFrom = replaceFrom || "";
        this.replaceTo = replaceTo !== undefined ? replaceTo : "";

        this.writer = null;
        this.currentHandle = null;

        this.bufferedWrites = [];

    }

    cancel() {
        this.cancelled = true;
    }

    // NEW: replace all occurrences of replaceFrom with replaceTo.
    // Uses split/join instead of a regex so special regex characters
    // (., |, etc.) are treated literally.
    applyReplacement(line) {

        if (!this.replaceFrom)
            return line;

        return line.split(this.replaceFrom).join(this.replaceTo);

    }

    async createNewFile() {

        const name = this.file.name.replace(/\.[^/.]+$/, "") +
            `_chunk_${String(this.fileIndex).padStart(4, "0")}.txt`;

        this.currentHandle =
            await this.outputDirectory.getFileHandle(name, {
                create: true
            });

        this.writer =
            await this.currentHandle.createWritable();

        this.currentSize = 0;

        // Write header to every file
        if (this.headerLine !== null) {

            const header = this.headerLine + "\n";

            await this.writer.write(header);

            this.currentSize +=
                this.encoder.encode(header).length;

        }

        this.fileIndex++;

    }

    async closeFile() {

        await this.flushBuffer();

        if (this.writer) {

            await this.writer.close();

            this.writer = null;

        }

    }

    shouldInclude(line) {

        if (!this.regex)
            return true;

        const match = this.regex.test(line);

        return this.mode === "keep"
            ? match
            : !match;

    }

    async flushBuffer() {

        if (!this.writer)
            return;

        if (this.bufferedWrites.length === 0)
            return;

        const text =
            this.bufferedWrites.join("");

        this.bufferedWrites = [];

        await this.writer.write(text);

    }

    async writeLine(line) {

        if (!this.writer)
            await this.createNewFile();

        const text = line + "\n";

        const bytes =
            this.encoder.encode(text).length;

        if (this.currentSize + bytes > this.maxBytes) {

            await this.closeFile();

            await this.createNewFile();

        }

        this.bufferedWrites.push(text);

        this.currentSize += bytes;

        if (this.bufferedWrites.length >= 1000) {

            await this.flushBuffer();

        }

    }

    async processLine(line) {

        // first line becomes header
        if (this.headerLine === null) {

            // Preserve the original header exactly as read.
            this.headerLine = line;

            return;

        }

        this.totalRead +=
            this.encoder.encode(line + "\n").length;

        // Regex filtering runs against the ORIGINAL line, so the
        // pattern still matches raw delimiters/content even if
        // replacement would otherwise alter them.
        if (this.shouldInclude(line)) {

            await this.writeLine(this.applyReplacement(line));

        }

        const percent =
            Math.min(
                100,
                (this.totalRead / this.file.size) * 100
            );

        this.progressCallback(
            percent,
            `Processing... ${percent.toFixed(1)}%`
        );

    }

    async split() {

        let buffer = "";

        const reader =
            this.file.stream().getReader();

        while (!this.cancelled) {

            const { done, value } =
                await reader.read();

            if (done)
                break;

            buffer +=
                this.decoder.decode(value, {
                    stream: true
                });

            const lines =
                buffer.split(/\r?\n/);

            buffer = lines.pop();

            for (const line of lines) {

                if (this.cancelled)
                    break;

                await this.processLine(line);

            }

        }

        // flush decoder
        buffer += this.decoder.decode();

        if (buffer.length > 0 && !this.cancelled) {

            await this.processLine(buffer);

        }

        await this.closeFile();

        this.progressCallback(
            100,
            this.cancelled
                ? "Cancelled"
                : "Finished"
        );

    }

}