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
import {
  COLORS,
  FONTS,
  drawGlassPanel,
  drawNeonLine,
  applyNeonText,
  createNeonTextStyle,
  hexToString,
} from '../ui/theme';

const SPEED_START = 110;
const SPEED_MAX = 220;
const RAMP_DURATION_MS = 180000;

const MAX_POINTS = 1000;
const MIN_POINTS = 100;
const POINTS_DECAY = 1.2;

const MISS_LIMIT = 3;

const NOTE_HEAD_WIDTH = 22;
const NOTE_HEAD_HEIGHT = 16;

const DEBUG = false;

interface ActiveNote {
  name: NoteName;
  midi: number;
  container: Phaser.GameObjects.Container;
  head: Phaser.GameObjects.Ellipse;
  headGlow: Phaser.GameObjects.Ellipse;
  stem: Phaser.GameObjects.Rectangle;
  stemGlow: Phaser.GameObjects.Rectangle;
  ledger: Phaser.GameObjects.Graphics;
  trail: Phaser.GameObjects.Graphics;
  spawnTime: number;
}

interface KeyData {
  note: NoteName;
  midi: number;
  rect: Phaser.GameObjects.Rectangle;
  glow: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  centerX: number;
}

export class GameScene extends Phaser.Scene {
  private bgGraphics!: Phaser.GameObjects.Graphics;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private dustParticles?: Phaser.GameObjects.Particles.ParticleEmitter;

  private staffContainer!: Phaser.GameObjects.Container;
  private staffGraphics!: Phaser.GameObjects.Graphics;
  private staffGlowGraphics!: Phaser.GameObjects.Graphics;
  private clefText!: Phaser.GameObjects.Text;
  private failLine!: Phaser.GameObjects.Graphics;
  private failLineGlow!: Phaser.GameObjects.Graphics;

  private keyboardGroup?: Phaser.GameObjects.Group;
  private keyboardGlowStrip!: Phaser.GameObjects.Graphics;
  private whiteKeyData: KeyData[] = [];

  private hudPanel!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private missesText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;

  private gameOverElements: Phaser.GameObjects.GameObject[] = [];
  private restartButton!: Phaser.GameObjects.Graphics;

  private particleTextureCyan!: string;
  private particleTextureMagenta!: string;

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

  private trailPositions: { x: number; y: number }[] = [];

  constructor() {
    super('GameScene');
  }

  create() {
    this.resetState();
    this.createTextures();
    this.createBackground();
    this.createUI();
    this.createLayout();
    this.createKeyboard();
    this.createInput();
    this.startFailLinePulse();

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
    this.speedText.setText(`${this.speed} px/s`);

    const move = (this.speed * delta) / 1000;
    this.currentNote.container.x += move;

    this.updateNoteTrail();

    if (this.currentNote.container.x >= this.failLineX) {
      this.triggerGameOver();
    }
  }

  private createTextures() {
    if (!this.textures.exists('particle_cyan')) {
      const gfx = this.add.graphics();
      gfx.fillStyle(COLORS.neonCyan, 1);
      gfx.fillCircle(6, 6, 6);
      gfx.generateTexture('particle_cyan', 12, 12);
      gfx.destroy();
    }
    this.particleTextureCyan = 'particle_cyan';

    if (!this.textures.exists('particle_magenta')) {
      const gfx = this.add.graphics();
      gfx.fillStyle(COLORS.neonMagenta, 1);
      gfx.fillCircle(6, 6, 6);
      gfx.generateTexture('particle_magenta', 12, 12);
      gfx.destroy();
    }
    this.particleTextureMagenta = 'particle_magenta';

    if (!this.textures.exists('particle_white')) {
      const gfx = this.add.graphics();
      gfx.fillStyle(COLORS.white, 1);
      gfx.fillCircle(4, 4, 4);
      gfx.generateTexture('particle_white', 8, 8);
      gfx.destroy();
    }
  }

  private createBackground() {
    const width = this.scale.gameSize.width;
    const height = this.scale.gameSize.height;

    this.bgGraphics = this.add.graphics();
    this.bgGraphics.setDepth(-100);

    this.bgGraphics.fillGradientStyle(COLORS.bg, COLORS.bg, COLORS.bgDark, COLORS.bgDark, 1);
    this.bgGraphics.fillRect(0, 0, width, height);

    this.gridGraphics = this.add.graphics();
    this.gridGraphics.setDepth(-99);
    this.drawGrid();

    this.createDustParticles();
  }

  private drawGrid() {
    const width = this.scale.gameSize.width;
    const height = this.scale.gameSize.height;

    this.gridGraphics.clear();
    this.gridGraphics.lineStyle(1, COLORS.bgGrid, 0.15);

    const gridSize = 40;
    for (let x = 0; x <= width; x += gridSize) {
      this.gridGraphics.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += gridSize) {
      this.gridGraphics.lineBetween(0, y, width, y);
    }

    this.gridGraphics.lineStyle(1, COLORS.neonCyan, 0.05);
    this.gridGraphics.lineBetween(0, height * 0.5, width, height * 0.5);
    this.gridGraphics.lineBetween(width * 0.5, 0, width * 0.5, height);
  }

  private createDustParticles() {
    const width = this.scale.gameSize.width;
    const height = this.scale.gameSize.height;

    this.dustParticles = this.add.particles(0, 0, 'particle_white', {
      x: { min: 0, max: width },
      y: { min: 0, max: height },
      scale: { min: 0.1, max: 0.3 },
      alpha: { start: 0.3, end: 0 },
      lifespan: 4000,
      frequency: 200,
      blendMode: 'ADD',
      speedY: { min: -10, max: -30 },
      speedX: { min: -5, max: 5 },
    });
    this.dustParticles.setDepth(-98);
  }

  private createLayout() {
    this.staffGlowGraphics = this.add.graphics();
    this.staffGraphics = this.add.graphics();
    this.staffContainer = this.add.container(0, 0);

    this.clefText = this.add.text(0, 0, '𝄞', {
      fontFamily: '"Times New Roman", serif',
      fontSize: '52px',
      color: hexToString(COLORS.neonCyan),
    });
    applyNeonText(this.clefText, COLORS.neonCyan, 12);

    this.staffContainer.add([this.staffGlowGraphics, this.staffGraphics, this.clefText]);

    this.failLineGlow = this.add.graphics();
    this.failLine = this.add.graphics();

    this.layoutScene();
  }

  private layoutScene() {
    const width = this.scale.gameSize.width;
    const height = this.scale.gameSize.height;

    this.staffLeft = width * 0.08;
    this.staffRight = width * 0.92;
    const staffAreaHeight = height * 0.25;
    this.staffSpacing = staffAreaHeight / 4;
    // Center the staff block between the HUD and keyboard for better balance
    const hudBottom = 56;
    const keyboardTop = this.keyboardY;
    const staffBlockHeight = staffAreaHeight + this.staffSpacing * 2;
    this.staffTop = hudBottom + (keyboardTop - hudBottom - staffBlockHeight) / 2 + this.staffSpacing * 0.7;
    this.staffBottom = this.staffTop + this.staffSpacing * 4;

    this.noteStartX = this.staffLeft + 70;
    this.failLineX = this.staffRight;

    this.keyboardHeight = height * 0.30;
    this.keyboardY = height * 0.64;

    this.bgGraphics?.clear();
    this.bgGraphics?.fillGradientStyle(COLORS.bg, COLORS.bg, COLORS.bgDark, COLORS.bgDark, 1);
    this.bgGraphics?.fillRect(0, 0, width, height);
    this.drawGrid();

    this.drawStaff();
    this.drawFailLine();

    this.layoutUI();
    this.layoutKeyboard();
  }

  private drawStaff() {
    this.staffGraphics.clear();
    this.staffGlowGraphics.clear();

    for (let i = 0; i < 5; i += 1) {
      const y = this.staffTop + i * this.staffSpacing;

      this.staffGlowGraphics.lineStyle(6, COLORS.neonCyan, 0.2);
      this.staffGlowGraphics.lineBetween(this.staffLeft, y, this.staffRight, y);

      this.staffGlowGraphics.lineStyle(3, COLORS.neonCyan, 0.4);
      this.staffGlowGraphics.lineBetween(this.staffLeft, y, this.staffRight, y);

      this.staffGraphics.lineStyle(1.5, COLORS.white, 0.9);
      this.staffGraphics.lineBetween(this.staffLeft, y, this.staffRight, y);
    }

    this.clefText.setPosition(this.staffLeft - 40, this.staffTop - this.staffSpacing * 1.3);
  }

  private drawFailLine() {
    const y1 = this.staffTop - this.staffSpacing;
    const y2 = this.staffBottom + this.staffSpacing;

    this.failLineGlow.clear();
    this.failLineGlow.lineStyle(12, COLORS.neonMagenta, 0.3);
    this.failLineGlow.lineBetween(this.failLineX, y1, this.failLineX, y2);
    this.failLineGlow.lineStyle(6, COLORS.neonMagenta, 0.5);
    this.failLineGlow.lineBetween(this.failLineX, y1, this.failLineX, y2);

    this.failLine.clear();
    this.failLine.lineStyle(2, COLORS.white, 1);
    this.failLine.lineBetween(this.failLineX, y1, this.failLineX, y2);
  }

  private startFailLinePulse() {
    this.tweens.add({
      targets: this.failLineGlow,
      alpha: { from: 1, to: 0.5 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  private createUI() {
    this.hudPanel = this.add.graphics();
    this.hudPanel.setDepth(100);

    const textStyle = createNeonTextStyle(COLORS.neonCyan, '16px');

    this.scoreText = this.add.text(0, 0, 'SCORE: 0', textStyle);
    this.scoreText.setDepth(101);

    this.missesText = this.add.text(0, 0, 'MISS: 0/3', {
      ...textStyle,
      color: hexToString(COLORS.neonMagenta),
    });
    applyNeonText(this.missesText, COLORS.neonMagenta, 6);
    this.missesText.setDepth(101);

    this.speedText = this.add.text(0, 0, `${this.speed} px/s`, textStyle);
    this.speedText.setDepth(101);

    this.layoutUI();
  }

  private layoutUI() {
    const width = this.scale.gameSize.width;
    const panelWidth = Math.min(480, width - 32);
    const panelX = (width - panelWidth) / 2;
    const panelY = 8;
    const panelHeight = 36;

    this.hudPanel.clear();
    drawGlassPanel(this.hudPanel, {
      x: panelX,
      y: panelY,
      width: panelWidth,
      height: panelHeight,
      cornerRadius: 8,
    });

    const textY = panelY + panelHeight / 2 - 8;
    const spacing = panelWidth / 3;

    this.scoreText.setPosition(panelX + 16, textY);
    this.missesText.setPosition(panelX + spacing + 16, textY);
    this.speedText.setPosition(panelX + spacing * 2 + 16, textY);
  }

  private createKeyboard() {
    this.keyboardGlowStrip = this.add.graphics();
    this.keyboardGroup = this.add.group();
    this.whiteKeyData = [];
    this.layoutKeyboard();
  }

  private layoutKeyboard() {
    if (!this.keyboardGroup) return;

    this.keyboardGroup.clear(true, true);
    this.whiteKeyData = [];

    const width = this.scale.gameSize.width;
    const whiteKeyWidth = width / NOTES_NATURAL.length;
    const whiteKeyHeight = this.keyboardHeight;

    this.keyboardGlowStrip.clear();
    this.keyboardGlowStrip.fillStyle(COLORS.neonCyan, 0.15);
    this.keyboardGlowStrip.fillRect(0, this.keyboardY - 4, width, 4);
    drawNeonLine(this.keyboardGlowStrip, 0, this.keyboardY - 2, width, this.keyboardY - 2, {
      glowColor: COLORS.neonCyan,
      coreColor: COLORS.neonCyan,
      glowWidth: 4,
      coreWidth: 1,
      glowAlpha: 0.5,
    });

    this.whiteKeyData = NOTES_NATURAL.map((note, index) => {
      const x = index * whiteKeyWidth;
      const midi = noteNameToMidi(note);
      const centerX = x + whiteKeyWidth / 2;
      const centerY = this.keyboardY + whiteKeyHeight / 2;

      const glow = this.add.rectangle(
        centerX,
        centerY,
        whiteKeyWidth - 2,
        whiteKeyHeight - 4,
        COLORS.neonCyan,
        0
      );
      glow.setStrokeStyle(4, COLORS.neonCyan, 0);

      const key = this.add.rectangle(
        centerX,
        centerY,
        whiteKeyWidth - 4,
        whiteKeyHeight - 8,
        COLORS.glassFill,
        0.3
      );
      key.setStrokeStyle(1, COLORS.neonCyan, 0.6);
      key.setInteractive({ useHandCursor: true });

      key.on('pointerover', () => {
        if (!this.isGameOver) {
          key.setFillStyle(COLORS.glassFill, 0.5);
          key.setStrokeStyle(2, COLORS.neonCyan, 1);
          glow.setStrokeStyle(6, COLORS.neonCyan, 0.4);
        }
      });

      key.on('pointerout', () => {
        key.setFillStyle(COLORS.glassFill, 0.3);
        key.setStrokeStyle(1, COLORS.neonCyan, 0.6);
        glow.setStrokeStyle(4, COLORS.neonCyan, 0);
      });

      key.on('pointerdown', () => this.handleInput(midi, note));

      const label = this.add.text(centerX, this.keyboardY + whiteKeyHeight - 20, note, {
        fontFamily: FONTS.ui,
        fontSize: '11px',
        color: hexToString(COLORS.textDim),
      }).setOrigin(0.5);

      this.keyboardGroup?.addMultiple([glow, key, label]);

      return { note, midi, rect: key, glow, label, centerX };
    });

    const blackKeyWidth = whiteKeyWidth * 0.55;
    const blackKeyHeight = whiteKeyHeight * 0.58;
    const blackKeyY = this.keyboardY + blackKeyHeight * 0.5;

    for (let octave = 0; octave < 2; octave += 1) {
      const octaveStart = octave * 7;
      const blackOffsets = [
        [0, 1],
        [1, 2],
        [3, 4],
        [4, 5],
        [5, 6],
      ];

      blackOffsets.forEach(([leftOffset, rightOffset]) => {
        const leftKey = this.whiteKeyData[octaveStart + leftOffset];
        const rightKey = this.whiteKeyData[octaveStart + rightOffset];
        if (!leftKey || !rightKey) return;

        const blackX = (leftKey.centerX + rightKey.centerX) / 2;

        const glow = this.add.rectangle(blackX, blackKeyY, blackKeyWidth, blackKeyHeight, COLORS.neonMagenta, 0);
        glow.setStrokeStyle(3, COLORS.neonMagenta, 0.3);
        glow.setDepth(5);

        const key = this.add.rectangle(blackX, blackKeyY, blackKeyWidth - 4, blackKeyHeight - 4, 0x0a0a12, 0.95);
        key.setStrokeStyle(1, COLORS.neonMagenta, 0.5);
        key.setDepth(6);
        key.disableInteractive();

        this.keyboardGroup?.addMultiple([glow, key]);
      });
    }
  }

  private createInput() {
    this.input.keyboard?.removeAllListeners('keydown');
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (this.isGameOver) return;

      const key = event.key.toLowerCase();
      const note = KEYBOARD_NOTE_MAP[key];
      if (note) {
        const midi = noteNameToMidi(note);
        this.handleInput(midi, note);
      }
    });
  }

  private spawnNote() {
    if (this.isGameOver) return;

    if (this.currentNote) {
      this.currentNote.container.destroy(true);
    }

    this.trailPositions = [];

    const noteName = getRandomNote();
    const noteMidi = noteNameToMidi(noteName);
    const noteIndex = getStaffIndex(noteName);
    const step = this.staffSpacing / 2;
    const noteY = this.staffBottom - noteIndex * step;

    const ledger = this.add.graphics();

    if (noteIndex <= -2) {
      for (let idx = -2; idx >= noteIndex; idx -= 2) {
        const yOffset = (noteIndex - idx) * step;
        drawNeonLine(ledger, -20, yOffset, 20, yOffset, {
          glowColor: COLORS.neonCyan,
          glowWidth: 4,
          coreWidth: 1.5,
          glowAlpha: 0.4,
        });
      }
    }

    if (noteIndex >= 10) {
      for (let idx = 10; idx <= noteIndex; idx += 2) {
        const yOffset = (noteIndex - idx) * step;
        drawNeonLine(ledger, -20, yOffset, 20, yOffset, {
          glowColor: COLORS.neonCyan,
          glowWidth: 4,
          coreWidth: 1.5,
          glowAlpha: 0.4,
        });
      }
    }

    const trail = this.add.graphics();

    const headGlow = this.add.ellipse(0, 0, NOTE_HEAD_WIDTH + 8, NOTE_HEAD_HEIGHT + 6, COLORS.neonCyan, 0.3);
    const head = this.add.ellipse(0, 0, NOTE_HEAD_WIDTH, NOTE_HEAD_HEIGHT, COLORS.neonCyan, 1);
    head.setStrokeStyle(2, COLORS.white, 1);

    const stemGlow = this.add.rectangle(11, -20, 6, 38, COLORS.neonCyan, 0.3);
    const stem = this.add.rectangle(11, -20, 2, 36, COLORS.white, 1);

    const container = this.add.container(this.noteStartX, noteY, [trail, ledger, headGlow, head, stemGlow, stem]);

    this.currentNote = {
      name: noteName,
      midi: noteMidi,
      container,
      head,
      headGlow,
      stem,
      stemGlow,
      ledger,
      trail,
      spawnTime: this.time.now,
    };
    this.currentTargetMidi = noteMidi;

    this.tweens.add({
      targets: headGlow,
      alpha: { from: 0.3, to: 0.6 },
      scaleX: { from: 1, to: 1.1 },
      scaleY: { from: 1, to: 1.1 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    if (DEBUG) {
      console.log('[spawn]', noteName, noteMidi);
    }
  }

  private updateNoteTrail() {
    if (!this.currentNote) return;

    this.trailPositions.push({ x: 0, y: 0 });
    if (this.trailPositions.length > 12) {
      this.trailPositions.shift();
    }

    this.currentNote.trail.clear();

    for (let i = 0; i < this.trailPositions.length - 1; i++) {
      const alpha = (i / this.trailPositions.length) * 0.4;
      const width = (i / this.trailPositions.length) * 3;

      this.currentNote.trail.lineStyle(width, COLORS.neonCyan, alpha);
      const offsetX = -(this.trailPositions.length - i) * 8;
      this.currentNote.trail.lineBetween(offsetX, 0, offsetX + 8, 0);
    }
  }

  private handleInput(pressedMidi: number, label?: string) {
    if (!this.currentNote || this.isGameOver) return;

    if (DEBUG) {
      console.log('[press]', label ?? midiToNoteName(pressedMidi), pressedMidi);
      console.log('[compare]', pressedMidi, this.currentTargetMidi);
    }

    if (pressedMidi === this.currentTargetMidi) {
      this.handleCorrect(label);
    } else {
      this.handleWrong(label);
    }
  }

  private handleCorrect(noteName?: string) {
    if (!this.currentNote) return;

    playNoteSound(this.currentNote.midi);

    const elapsed = this.time.now - this.currentNote.spawnTime;
    const points = Phaser.Math.Clamp(Math.round(MAX_POINTS - elapsed * POINTS_DECAY), MIN_POINTS, MAX_POINTS);
    this.score += points;

    this.updateUI();

    const noteX = this.currentNote.container.x;
    const noteY = this.currentNote.container.y;

    this.playNeonExplosion(noteX, noteY, points);

    if (noteName) {
      this.flashKey(noteName, true);
    }

    const noteRef = this.currentNote;
    this.currentNote = undefined;
    this.currentTargetMidi = undefined;

    this.tweens.killTweensOf(noteRef.headGlow);
    noteRef.container.setActive(false).setVisible(false);
    noteRef.container.destroy(true);

    this.time.delayedCall(80, () => this.spawnNote());
  }

  private handleWrong(noteName?: string) {
    playErrorSound();

    this.misses += 1;
    this.updateUI();

    this.tweens.add({
      targets: this.missesText,
      scaleX: { from: 1.3, to: 1 },
      scaleY: { from: 1.3, to: 1 },
      duration: 200,
      ease: 'Back.Out',
    });

    this.tweens.add({
      targets: this.staffContainer,
      x: { from: -6, to: 6 },
      duration: 40,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.InOut',
      onComplete: () => this.staffContainer.setX(0),
    });

    if (noteName) {
      this.flashKey(noteName, false);
    }

    if (this.misses >= MISS_LIMIT) {
      this.triggerGameOver();
    }
  }

  private flashKey(noteName: string, correct: boolean) {
    const keyData = this.whiteKeyData.find((k) => k.note === noteName);
    if (!keyData) return;

    const color = correct ? COLORS.neonCyan : COLORS.neonRed;

    keyData.rect.setFillStyle(color, 0.6);
    keyData.glow.setStrokeStyle(8, color, 0.6);

    if (correct) {
      const particles = this.add.particles(keyData.centerX, this.keyboardY, this.particleTextureCyan, {
        speed: { min: 30, max: 80 },
        angle: { min: 250, max: 290 },
        scale: { start: 0.4, end: 0 },
        lifespan: 400,
        blendMode: 'ADD',
      });
      particles.explode(8);
      this.time.delayedCall(500, () => particles.destroy());
    }

    this.time.delayedCall(150, () => {
      keyData.rect.setFillStyle(COLORS.glassFill, 0.3);
      keyData.glow.setStrokeStyle(4, COLORS.neonCyan, 0);
    });
  }

  private playNeonExplosion(x: number, y: number, points: number) {
    const particles = this.add.particles(x, y, this.particleTextureCyan, {
      speed: { min: 60, max: 200 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0 },
      lifespan: 500,
      blendMode: 'ADD',
    });
    particles.explode(20);

    const ring = this.add.graphics();
    ring.lineStyle(3, COLORS.neonCyan, 1);
    ring.strokeCircle(x, y, 10);

    this.tweens.add({
      targets: ring,
      scaleX: 4,
      scaleY: 4,
      alpha: 0,
      duration: 350,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });

    const flash = this.add.rectangle(
      this.scale.gameSize.width / 2,
      this.scale.gameSize.height / 2,
      this.scale.gameSize.width,
      this.scale.gameSize.height,
      COLORS.neonCyan,
      0.08
    );
    flash.setDepth(500);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 150,
      onComplete: () => flash.destroy(),
    });

    const pointsText = this.add.text(x, y - 24, `+${points}`, createNeonTextStyle(COLORS.neonGreen, '20px'));
    pointsText.setOrigin(0.5);
    applyNeonText(pointsText, COLORS.neonGreen, 10);

    this.tweens.add({
      targets: pointsText,
      y: y - 60,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.Out',
      onComplete: () => pointsText.destroy(),
    });

    this.time.delayedCall(600, () => particles.destroy());
  }

  private updateUI() {
    this.scoreText.setText(`SCORE: ${this.score}`);
    this.missesText.setText(`MISS: ${this.misses}/${MISS_LIMIT}`);
    this.speedText.setText(`${this.speed} px/s`);
  }

  private showGameOver() {
    this.destroyGameOverElements();

    const width = this.scale.gameSize.width;
    const height = this.scale.gameSize.height;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, COLORS.bgDark, 0.85);
    overlay.setDepth(1000);

    const modalWidth = 320;
    const modalHeight = 200;
    const modalX = (width - modalWidth) / 2;
    const modalY = (height - modalHeight) / 2;

    const modalPanel = this.add.graphics();
    modalPanel.setDepth(1001);
    drawGlassPanel(modalPanel, {
      x: modalX,
      y: modalY,
      width: modalWidth,
      height: modalHeight,
      fillAlpha: 0.6,
      strokeColor: COLORS.neonMagenta,
      cornerRadius: 16,
    });

    const title = this.add.text(width / 2, modalY + 50, 'GAME OVER', {
      fontFamily: FONTS.ui,
      fontSize: '36px',
      color: hexToString(COLORS.neonMagenta),
    }).setOrigin(0.5);
    applyNeonText(title, COLORS.neonMagenta, 16);
    title.setDepth(1002);

    const finalScore = this.add.text(width / 2, modalY + 95, `Final Score: ${this.score}`, createNeonTextStyle(COLORS.text, '18px')).setOrigin(0.5);
    finalScore.setDepth(1002);

    const btnWidth = 140;
    const btnHeight = 44;
    const btnX = width / 2 - btnWidth / 2;
    const btnY = modalY + 135;

    this.restartButton = this.add.graphics();
    this.restartButton.setDepth(1002);

    const drawButton = (hover: boolean) => {
      this.restartButton.clear();
      drawGlassPanel(this.restartButton, {
        x: btnX,
        y: btnY,
        width: btnWidth,
        height: btnHeight,
        fillColor: hover ? COLORS.neonCyan : COLORS.glassFill,
        fillAlpha: hover ? 0.3 : 0.4,
        strokeColor: COLORS.neonCyan,
        strokeAlpha: hover ? 1 : 0.8,
        strokeWidth: hover ? 3 : 2,
        cornerRadius: btnHeight / 2,
      });
    };

    drawButton(false);

    const btnText = this.add.text(width / 2, btnY + btnHeight / 2, 'RESTART', createNeonTextStyle(COLORS.neonCyan, '16px')).setOrigin(0.5);
    btnText.setDepth(1003);

    const hitArea = this.add.rectangle(width / 2, btnY + btnHeight / 2, btnWidth, btnHeight, 0x000000, 0);
    hitArea.setDepth(1004);
    hitArea.setInteractive({ useHandCursor: true });

    hitArea.on('pointerover', () => drawButton(true));
    hitArea.on('pointerout', () => drawButton(false));
    hitArea.on('pointerdown', () => this.restart());

    this.gameOverElements = [overlay, modalPanel, title, finalScore, this.restartButton, btnText, hitArea];
  }

  private destroyGameOverElements() {
    this.gameOverElements.forEach((el) => el.destroy());
    this.gameOverElements = [];
  }

  private triggerGameOver() {
    if (this.isGameOver) return;

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
      this.tweens.killTweensOf(this.currentNote.headGlow);
      this.currentNote.container.destroy(true);
      this.currentNote = undefined;
    }

    this.trailPositions = [];
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

    this.startFailLinePulse();
  }
}
