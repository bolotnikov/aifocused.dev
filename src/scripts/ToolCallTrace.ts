export class ToolCallTrace {
	private readonly parts: HTMLElement[];
	private readonly steps: HTMLElement[];
	private readonly back: HTMLButtonElement;
	private readonly next: HTMLButtonElement;
	private index = 0;

	constructor(root: HTMLElement) {
		this.parts = Array.from(root.querySelectorAll<HTMLElement>('[data-flow-part]'));
		this.steps = Array.from(root.querySelectorAll<HTMLElement>('[data-trace-step]'));
		const back = root.querySelector<HTMLButtonElement>('[data-trace-back]');
		const next = root.querySelector<HTMLButtonElement>('[data-trace-next]');
		const controls = root.querySelector<HTMLElement>('[data-trace-controls]');
		if (!back || !next || !controls || this.steps.length === 0) {
			throw new Error('Tool calling diagram controls are incomplete.');
		}

		this.back = back;
		this.next = next;
		back.addEventListener('click', () => this.move(-1));
		next.addEventListener('click', () => this.move(1));
		this.render();
		controls.hidden = false;
	}

	private move(direction: -1 | 1): void {
		this.index += direction;
		this.render();
	}

	private render(): void {
		const current = this.steps[this.index];
		if (!current) throw new Error('Tool calling diagram step is missing.');

		const route = current.dataset['traceStep'];
		for (const part of this.parts) {
			const routes = part.dataset['flowPart']?.split(' ') ?? [];
			part.toggleAttribute('data-active', routes.some((value) => value === route));
		}

		this.steps.forEach((step, index) => { step.hidden = index !== this.index; });
		this.back.disabled = this.index === 0;
		this.next.disabled = this.index === this.steps.length - 1;
	}
}
