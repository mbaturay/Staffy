import Phaser from 'phaser';
import {
  KEYBOARD_NOTE_MAP,
  NoteName,
  NOTES_NATURAL,
  getRandomNote,
  getStaffIndex,
  midiToNoteName,
  noteNameToMidi,
} from '../game/notes';
import { playNoteSound, playErrorSound } from '../game/audio';

const SPEED_START = 110;
const SPEED_MAX = 220;
const RAMP_DURATION_MS = 180000;

const MAX_POINTS = 1000;
const MIN_POINTS = 100;
const POINTS_DECAY = 1.2; // points per ms

const MISS_LIMIT = 3;

const NOTE_COLOR = 0x1b1b1b;
const STAFF_COLOR = 0x2e2a24;
const FAIL_COLOR = 0xd64545;

const NOTE_HEAD_WIDTH = 22;
const NOTE_HEAD_HEIGHT = 16;

const PARTICLE_COLOR = 0xf2b134;
const DEBUG = false;

interface ActiveNote {
  name: NoteName;
  midi: number;
  container: Phaser.GameObjects.Container;
  head: Phaser.GameObjects.Ellipse;
  stem: Phaser.GameObjects.Rectangle;
  ledger: Phaser.GameObjects.Graphics;
  spawnTime: number;
}

export class GameScene extends Phaser.Scene {
  private staffContainer!: Phaser.GameObjects.Container;
  private staffGraphics!: Phaser.GameObjects.Graphics;
  private clefText!: Phaser.GameObjects.Text;
  private failLine!: Phaser.GameObjects.Graphics;

  private keyboardGroup?: Phaser.GameObjects.Group;

  private scoreText!: Phaser.GameObjects.Text;
  private missesText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;

  private gameOverElements: Phaser.GameObjects.GameObject[] = [];
  private restartButton!: Phaser.GameObjects.Rectangle;

  private particleTexture!: string;

  private staffTop = 0;
  private staffBottom = 0;
  private staffSpacing = 0;
  private staffLeft = 0;
  private staffRight = 0;
  private noteStartX = 0;
  private failLineX = 0;

  private keyboardY = 0;
  private keyboardHeight = 0;

  private currentNote?: ActiveNote;
  private currentTargetMidi?: number;
  private score = 0;
  private misses = 0;
  private speed = SPEED_START;
  private runTimeMs = 0;
  private isGameOver = false;

  constructor() {
    super('GameScene');
  }

  create() {
    this.resetState();
    this.createTextures();
    this.particleTexture = 'particle';
    this.createUI();
    this.createLayout();
    this.createKeyboard();
    this.createInput();

    this.spawnNote();

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', this.onShutdown, this);
  }

  private onShutdown() {
    this.scale.off('resize', this.onResize, this);
    this.input.keyboard?.removeAllListeners();
  }

  update(_time: number, delta: number) {
    if (this.isGameOver || !this.currentNote) {
      return;
    }

    this.runTimeMs += delta;
    this.speed = this.getRampSpeed();
    this.speedText.setText(`Speed: ${this.speed} px/s`);

    const move = (this.speed * delta) / 1000;
    this.currentNote.container.x += move;

    if (this.currentNote.container.x >= this.failLineX) {
      this.triggerGameOver();
    }
  }

  private createTextures() {
    if (this.textures.exists('particle')) {
      return;
    }
    const gfx = this.add.graphics();
    gfx.fillStyle(PARTICLE_COLOR, 1);
    gfx.fillCircle(4, 4, 4);
    gfx.generateTexture('particle', 8, 8);
    gfx.destroy();
  }

  private createLayout() {
    this.staffContainer = this.add.container(0, 0);
    this.staffGraphics = this.add.graphics();
    this.clefText = this.add.text(0, 0, '𝄞', {
      fontFamily: '"Times New Roman", serif',
      fontSize: '48px',
      color: '#2e2a24',
    });

    this.staffContainer.add([this.staffGraphics, this.clefText]);

    this.failLine = this.add.graphics();

    this.layoutScene();
  }

  private layoutScene() {
    const width = this.scale.gameSize.width;
    const height = this.scale.gameSize.height;

    this.staffLeft = width * 0.08;
    this.staffRight = width * 0.92;
    const staffAreaHeight = height * 0.25;
    this.staffTop = height * 0.12;
    this.staffSpacing = staffAreaHeight / 4;
    this.staffBottom = this.staffTop + this.staffSpacing * 4;

    this.noteStartX = this.staffLeft + 70;
    this.failLineX = this.staffRight;

    this.keyboardHeight = height * 0.32;
    this.keyboardY = height * 0.62;

    this.drawStaff();
    this.drawFailLine();

    this.layoutUI();
    this.layoutKeyboard();
  }

  private drawStaff() {
    this.staffGraphics.clear();
    this.staffGraphics.lineStyle(2, STAFF_COLOR, 1);

    for (let i = 0; i < 5; i += 1) {
      const y = this.staffTop + i * this.staffSpacing;
      this.staffGraphics.lineBetween(this.staffLeft, y, this.staffRight, y);
    }

    this.clefText.setPosition(this.staffLeft - 36, this.staffTop - this.staffSpacing * 1.2);
  }

  private drawFailLine() {
    this.failLine.clear();
    this.failLine.lineStyle(4, FAIL_COLOR, 1);
    this.failLine.lineBetween(this.failLineX, this.staffTop - this.staffSpacing, this.failLineX, this.staffBottom + this.staffSpacing);
  }

  private createUI() {
    this.scoreText = this.add.text(16, 10, 'Score: 0', {
      fontSize: '18px',
      color: '#2e2a24',
    });

    this.missesText = this.add.text(160, 10, 'Misses: 0/3', {
      fontSize: '18px',
      color: '#a54343',
    });

    this.speedText = this.add.text(320, 10, `Speed: ${this.speed} px/s`, {
      fontSize: '18px',
      color: '#2e2a24',
    });
  }

  private layoutUI() {
    this.scoreText.setPosition(16, 10);
    this.missesText.setPosition(160, 10);
    this.speedText.setPosition(320, 10);
  }

  private createKeyboard() {
    this.keyboardGroup = this.add.group();
    this.layoutKeyboard();
  }

  private layoutKeyboard() {
    if (!this.keyboardGroup) {
      return;
    }

    this.keyboardGroup.clear(true, true);

    const width = this.scale.gameSize.width;
    const whiteKeyWidth = width / NOTES_NATURAL.length;
    const whiteKeyHeight = this.keyboardHeight;

    const whiteKeys = NOTES_NATURAL.map((note, index) => {
      const x = index * whiteKeyWidth;
      const midi = noteNameToMidi(note);
      const key = this.add.rectangle(x + whiteKeyWidth / 2, this.keyboardY + whiteKeyHeight / 2, whiteKeyWidth, whiteKeyHeight, 0xffffff, 1);
      key.setStrokeStyle(2, 0x2a2824, 1);
      key.setInteractive({ useHandCursor: true });
      key.on('pointerdown', () => this.handleInput(midi, note));

      const label = this.add.text(x + whiteKeyWidth / 2, this.keyboardY + whiteKeyHeight - 16, note, {
        fontSize: '12px',
        color: '#2a2824',
      }).setOrigin(0.5);

      this.keyboardGroup?.addMultiple([key, label]);

      return {
        note,
        midi,
        rect: key,
        centerX: x + whiteKeyWidth / 2,
      };
    });

    const blackKeyWidth = whiteKeyWidth * 0.6;
    const blackKeyHeight = whiteKeyHeight * 0.62;
    const blackKeyY = this.keyboardY + blackKeyHeight * 0.55;

    for (let octave = 0; octave < 2; octave += 1) {
      const octaveStart = octave * 7;
      const blackOffsets = [
        [0, 1], // C# between C and D
        [1, 2], // D# between D and E
        [3, 4], // F# between F and G
        [4, 5], // G# between G and A
        [5, 6], // A# between A and B
      ];

      blackOffsets.forEach(([leftOffset, rightOffset]) => {
        const leftKey = whiteKeys[octaveStart + leftOffset];
        const rightKey = whiteKeys[octaveStart + rightOffset];
        if (!leftKey || !rightKey) {
          return;
        }

        const blackX = (leftKey.centerX + rightKey.centerX) / 2;
        const key = this.add.rectangle(blackX, blackKeyY, blackKeyWidth, blackKeyHeight, 0x000000, 1);
        key.setStrokeStyle(1, 0x111111, 1);
        key.setDepth(5);
        // Accidentals are inactive by default.
        key.disableInteractive();
        this.keyboardGroup?.add(key);
      });
    }
  }

  private createInput() {
    this.input.keyboard?.removeAllListeners('keydown');
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (this.isGameOver) {
        return;
      }

      const key = event.key.toLowerCase();
      const note = KEYBOARD_NOTE_MAP[key];
      if (note) {
        const midi = noteNameToMidi(note);
        this.handleInput(midi, note);
      }
    });
  }

  private spawnNote() {
    if (this.isGameOver) {
      return;
    }

    if (this.currentNote) {
      this.currentNote.container.destroy(true);
    }

    const noteName = getRandomNote();
    const noteMidi = noteNameToMidi(noteName);
    const noteIndex = getStaffIndex(noteName);
    const step = this.staffSpacing / 2;
    const noteY = this.staffBottom - noteIndex * step;

    const ledger = this.add.graphics();
    ledger.lineStyle(2, NOTE_COLOR, 1);

    if (noteIndex <= -2) {
      for (let idx = -2; idx >= noteIndex; idx -= 2) {
        const yOffset = (noteIndex - idx) * step;
        ledger.lineBetween(-18, yOffset, 18, yOffset);
      }
    }

    if (noteIndex >= 10) {
      for (let idx = 10; idx <= noteIndex; idx += 2) {
        const yOffset = (noteIndex - idx) * step;
        ledger.lineBetween(-18, yOffset, 18, yOffset);
      }
    }

    const head = this.add.ellipse(0, 0, NOTE_HEAD_WIDTH, NOTE_HEAD_HEIGHT, NOTE_COLOR, 1);
    const stem = this.add.rectangle(10, -18, 3, 34, NOTE_COLOR, 1);

    const container = this.add.container(this.noteStartX, noteY, [ledger, head, stem]);

    this.currentNote = {
      name: noteName,
      midi: noteMidi,
      container,
      head,
      stem,
      ledger,
      spawnTime: this.time.now,
    };
    this.currentTargetMidi = noteMidi;

    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log('[spawn]', noteName, noteMidi);
    }
  }

  private handleInput(pressedMidi: number, label?: string) {
    if (!this.currentNote || this.isGameOver) {
      return;
    }

    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log('[press]', label ?? midiToNoteName(pressedMidi), pressedMidi);
      // eslint-disable-next-line no-console
      console.log('[compare]', pressedMidi, this.currentTargetMidi);
    }

    if (pressedMidi === this.currentTargetMidi) {
      this.handleCorrect();
    } else {
      this.handleWrong();
    }
  }

  private handleCorrect() {
    if (!this.currentNote) {
      return;
    }

    playNoteSound(this.currentNote.midi);

    const elapsed = this.time.now - this.currentNote.spawnTime;
    const points = Phaser.Math.Clamp(Math.round(MAX_POINTS - elapsed * POINTS_DECAY), MIN_POINTS, MAX_POINTS);
    this.score += points;

    this.updateUI();

    const noteX = this.currentNote.container.x;
    const noteY = this.currentNote.container.y;

    this.playExplosion(noteX, noteY, points);

    const noteRef = this.currentNote;
    this.currentNote = undefined;
    this.currentTargetMidi = undefined;

    noteRef.container.setActive(false).setVisible(false);
    this.tweens.killTweensOf(noteRef.container);
    noteRef.container.destroy(true);

    this.time.delayedCall(60, () => this.spawnNote());
  }

  private handleWrong() {
    playErrorSound();

    this.misses += 1;
    this.updateUI();

    this.tweens.add({
      targets: this.staffContainer,
      x: this.staffContainer.x + 8,
      yoyo: true,
      repeat: 2,
      duration: 50,
      ease: 'Sine.InOut',
    });

    if (this.misses >= MISS_LIMIT) {
      this.triggerGameOver();
    }
  }

  private playExplosion(x: number, y: number, points: number) {
    const particles = this.add.particles(x, y, this.particleTexture, {
      speed: { min: 40, max: 160 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 },
      lifespan: 450,
      blendMode: 'ADD',
    });

    particles.explode(14);

    const pointsText = this.add.text(x, y - 24, `+${points}`, {
      fontSize: '18px',
      color: '#2c6e49',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: pointsText,
      y: y - 50,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.Out',
      onComplete: () => pointsText.destroy(),
    });

    this.time.delayedCall(500, () => particles.destroy());
  }

  private updateUI() {
    this.scoreText.setText(`Score: ${this.score}`);
    this.missesText.setText(`Misses: ${this.misses}/${MISS_LIMIT}`);
    this.speedText.setText(`Speed: ${this.speed} px/s`);
  }

  private showGameOver() {
    this.destroyGameOverElements();

    const width = this.scale.gameSize.width;
    const height = this.scale.gameSize.height;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x0c0b0a, 0.7);
    overlay.setDepth(1000);

    const title = this.add.text(width / 2, height / 2 - 40, 'Game Over', {
      fontSize: '42px',
      color: '#f5f2ea',
    }).setOrigin(0.5);
    title.setDepth(1001);

    this.restartButton = this.add.rectangle(width / 2, height / 2 + 24, 160, 44, 0xf2b134, 1);
    this.restartButton.setDepth(1002);
    this.restartButton.setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.restartButton.setFillStyle(0xf5c563))
      .on('pointerout', () => this.restartButton.setFillStyle(0xf2b134))
      .on('pointerdown', () => this.restart())
      .on('pointerup', () => this.restart());

    const restartText = this.add.text(width / 2, height / 2 + 24, 'Restart', {
      fontSize: '20px',
      color: '#2a2824',
    }).setOrigin(0.5);
    restartText.setDepth(1003);

    this.gameOverElements = [overlay, title, this.restartButton, restartText];
  }

  private destroyGameOverElements() {
    this.gameOverElements.forEach((el) => el.destroy());
    this.gameOverElements = [];
  }

  private triggerGameOver() {
    if (this.isGameOver) {
      return;
    }

    this.isGameOver = true;
    this.showGameOver();
  }

  private restart() {
    this.destroyGameOverElements();
    this.resetState();
    this.updateUI();
    this.spawnNote();
  }

  private onResize() {
    this.layoutScene();

    if (this.isGameOver && this.gameOverElements.length > 0) {
      this.showGameOver();
    }
  }

  private getRampSpeed(): number {
    const t = Phaser.Math.Clamp(this.runTimeMs / RAMP_DURATION_MS, 0, 1);
    const easedT = 1 - (1 - t) * (1 - t);
    return Math.round(Phaser.Math.Linear(SPEED_START, SPEED_MAX, easedT));
  }

  private resetState() {
    if (this.currentNote) {
      this.currentNote.container.destroy(true);
      this.currentNote = undefined;
    }

    this.tweens.killAll();
    this.time.removeAllEvents();

    this.score = 0;
    this.misses = 0;
    this.speed = SPEED_START;
    this.runTimeMs = 0;
    this.isGameOver = false;
    this.currentTargetMidi = undefined;

    if (this.staffContainer) {
      this.staffContainer.setPosition(0, 0);
    }
  }
}
