import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import OpenAI from 'openai';

const sampleFps = 1;
const maxFrames = 180;
const maxBatchSize = 12;
const framesPerSegment = 60;

const getVideoFrames = {
	type: 'function',
	name: 'get_video_frames',
	description: 'Read consecutive frames from a 1 FPS sample of the uploaded video. Returns JPEG images and timestamps.',
	strict: true,
	parameters: {
		type: 'object',
		properties: {
			fromFrame: { type: 'integer', minimum: 0, description: 'Zero-based index of the first frame.' },
			count: { type: 'integer', minimum: 1, maximum: maxBatchSize },
		},
		required: ['fromFrame', 'count'],
		additionalProperties: false,
	},
} satisfies OpenAI.Responses.FunctionTool;

interface Frame {
	path: string;
	timestampMs: number;
}

function decodeVideo(source: string, directory: string): Frame[] {
	const result = spawnSync('ffmpeg', [
		'-nostdin', '-hide_banner', '-nostats', '-loglevel', 'info',
		'-i', resolve(source), '-map', '0:V:0',
		'-vf', `fps=${sampleFps}:start_time=0,scale=512:512:force_original_aspect_ratio=decrease:force_divisible_by=2,showinfo=checksum=0`,
		'-fps_mode', 'passthrough', '-frames:v', String(maxFrames + 1), '-q:v', '4',
		join(directory, 'frame-%04d.jpg'),
	], { encoding: 'utf8', timeout: 300_000 });

	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`FFmpeg failed: ${result.stderr.trim()}`);

	const files = readdirSync(directory).sort();
	if (files.length === 0) throw new Error('The video has no readable frames.');
	if (files.length > maxFrames) throw new Error('This example supports up to 180 sampled frames (about 3 minutes).');

	const timestamps = [...result.stderr.matchAll(
		/\[Parsed_showinfo_[^\]]+\]\s+n:\s*(\d+)\s+pts:\s*\S+\s+pts_time:\s*(\S+)/g,
	)];
	if (files.length !== timestamps.length) throw new Error('Frame timestamps do not match the decoded images.');

	const startTime = Number(timestamps[0]?.[2]);
	return files.map((file, index) => {
		const timestampMs = Math.round((Number(timestamps[index]?.[2]) - startTime) * 1000);
		if (Number(timestamps[index]?.[1]) !== index || !Number.isFinite(timestampMs)) {
			throw new Error(`Invalid timestamp for frame ${index}.`);
		}
		return { path: join(directory, file), timestampMs };
	});
}

function execute(
	call: OpenAI.Responses.ResponseFunctionToolCall,
	frames: Frame[],
	delivered: Set<number>,
	start: number,
	end: number,
): string | OpenAI.Responses.ResponseFunctionCallOutputItemList {
	if (call.name !== getVideoFrames.name) return JSON.stringify({ error: 'UNKNOWN_TOOL' });

	let args: unknown;
	try {
		args = JSON.parse(call.arguments);
	} catch {
		return JSON.stringify({ error: 'INVALID_ARGUMENTS' });
	}

	if (
		!args || typeof args !== 'object' || Object.keys(args).length !== 2 ||
		!('fromFrame' in args) || !('count' in args)
	) {
		return JSON.stringify({ error: 'INVALID_ARGUMENTS' });
	}

	const { fromFrame, count } = args;
	if (
		typeof fromFrame !== 'number' || !Number.isSafeInteger(fromFrame) || fromFrame < 0 ||
		typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > maxBatchSize
	) {
		return JSON.stringify({ error: 'INVALID_ARGUMENTS', maxBatchSize });
	}

	if (fromFrame >= frames.length) {
		return JSON.stringify({ error: 'FRAME_OUT_OF_RANGE', totalFrames: frames.length });
	}
	if (fromFrame < start || fromFrame >= end) {
		return JSON.stringify({ error: 'FRAME_OUTSIDE_SEGMENT', start, endExclusive: end });
	}

	const content: OpenAI.Responses.ResponseFunctionCallOutputItemList = [];
	for (const [offset, frame] of frames.slice(fromFrame, Math.min(fromFrame + count, end)).entries()) {
		const frameIndex = fromFrame + offset;
		const jpeg = readFileSync(frame.path).toString('base64');
		content.push(
			{ type: 'input_text', text: JSON.stringify({ frame: frameIndex, timestampMs: frame.timestampMs }) },
			{ type: 'input_image', image_url: `data:image/jpeg;base64,${jpeg}`, detail: 'auto' },
		);
		delivered.add(frameIndex);
	}
	return content;
}

const source = process.argv[2];
if (!source) throw new Error('Usage: node --experimental-strip-types tool-calling.ts gameplay.mp4');

const model = process.env['OPENAI_MODEL'];
if (!model) throw new Error('Set OPENAI_MODEL to a model that supports images and Responses API function calling.');

const client = new OpenAI();
const task = 'Разбери запись геймплея и составь геймдизайн-документ.';

async function describeSegment(model: string, frames: Frame[], start: number, end: number): Promise<string> {
	const delivered = new Set<number>();
	const maxToolRounds = Math.ceil((end - start) / maxBatchSize) + 5;
	const options = {
		model,
		tools: [getVideoFrames],
		instructions: [
			`Во всём видео подготовлено ${frames.length} кадров (один в секунду). Разбери кадры с индекса ${start} по ${end - 1} включительно.`,
			`Запрашивай их по порядку по ${maxBatchSize} за вызов. Приложение вернёт кадры в пределах текущего отрезка.`,
			'Верни на русском наблюдения для геймдизайн-документа. Приводи таймкоды по timestampMs.',
			'Отмечай действия игрока, видимые правила, интерфейс и смену состояний.',
			'Отмечай, что видно на записи, а что пришлось предположить. Если способ управления неизвестен, так и укажи.',
		].join(' '),
		tool_choice: 'auto',
		parallel_tool_calls: false,
		store: true,
	} satisfies OpenAI.Responses.ResponseCreateParams;

	let response = await client.responses.create({
		...options,
		input: task,
	});

	for (let round = 0; ; round += 1) {
		if (response.status !== 'completed') {
			throw new Error(`Responses API returned status: ${response.status ?? 'unknown'}`);
		}

		const calls = response.output.filter((item) => item.type === 'function_call');
		if (calls.length === 0) {
			if (delivered.size !== end - start) {
				throw new Error(`The model stopped after receiving ${delivered.size} of ${end - start} frames.`);
			}
			if (!response.output_text.trim()) throw new Error('The model returned empty segment notes.');
			return response.output_text;
		}

		if (round >= maxToolRounds) throw new Error('Tool-call round limit reached.');

		const outputs = calls.map((call) => ({
			type: 'function_call_output' as const,
			call_id: call.call_id,
			output: execute(call, frames, delivered, start, end),
		}));

		response = await client.responses.create({
			...options,
			previous_response_id: response.id,
			input: outputs,
		});
	}
}

const directory = mkdtempSync(join(tmpdir(), 'playable-frames-'));

try {
	const frames = decodeVideo(source, directory);
	const notes: string[] = [];
	for (let start = 0; start < frames.length; start += framesPerSegment) {
		const end = Math.min(start + framesPerSegment, frames.length);
		const observations = await describeSegment(model, frames, start, end);
		notes.push(`Кадры ${start}–${end - 1}\n${observations}`);
	}

	const response = await client.responses.create({
		model,
		instructions: [
			'Из наблюдений по всем отрезкам собери один подробный геймдизайн-документ на русском в Markdown.',
			'Опиши игровой цикл, действия игрока, правила, интерфейс и смену состояний. Сохрани таймкоды.',
			'Отмечай неизвестное и отделяй гипотезы от наблюдений. Используй только данные из наблюдений.',
		].join(' '),
		input: notes.join('\n\n'),
	});
	if (response.status !== 'completed' || !response.output_text.trim()) {
		throw new Error('Responses API did not return a complete design document.');
	}
	console.log(response.output_text);
} finally {
	rmSync(directory, { recursive: true, force: true });
}
