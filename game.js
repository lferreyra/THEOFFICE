const config = {
    type: Phaser.CANVAS,
    width: 360,
    height: 640,
    parent: 'game-container',
    pixelArt: true,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    }
};

// Helper to remove white background from generated sprites
function createTransparentSpritesheet(scene, key, path, frameWidth, frameHeight) {
    scene.load.image(key + '_raw', path);
    scene.load.once('filecomplete-image-' + key + '_raw', () => {
        const texture = scene.textures.get(key + '_raw').getSourceImage();
        const canvas = document.createElement('canvas');
        canvas.width = texture.width;
        canvas.height = texture.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(texture, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
                data[i + 3] = 0;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        scene.textures.addSpriteSheet(key, canvas, { frameWidth, frameHeight });
    });
}

const SoundManager = {
    audioCtx: null,
    bgmTimer: null,
    isMuted: false,
    init() {
        if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    },
    playTone(freq, type = 'square', duration = 0.1, volume = 0.1) {
        if (!this.audioCtx || this.isMuted) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const oscillator = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        gainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);
        oscillator.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        oscillator.start();
        oscillator.stop(this.audioCtx.currentTime + duration);
    },
    playBGM() {
        if (this.bgmTimer) return;
        const notes = [261.63, 293.66, 329.63, 349.23, 392.00, 349.23, 329.63, 293.66];
        let index = 0;
        const playNext = () => {
            if (this.isMuted) return;
            this.playTone(notes[index], 'triangle', 0.2, 0.02);
            index = (index + 1) % notes.length;
            this.bgmTimer = setTimeout(playNext, 250);
        };
        playNext();
    },
    stopBGM() {
        if (this.bgmTimer) {
            clearTimeout(this.bgmTimer);
            this.bgmTimer = null;
        }
    },
    playWin() { this.playTone(523.25, 'square', 0.2); this.playTone(659.25, 'square', 0.2); this.playTone(783.99, 'square', 0.4); },
    playBust() { this.playTone(220, 'sawtooth', 0.3); this.playTone(110, 'sawtooth', 0.5); },
    playSelect() { this.playTone(880, 'square', 0.05); }
};

class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    preload() {
        this.load.image('office_tiles', 'assets/office.png');
    }

    create() {
        SoundManager.init();
        SoundManager.playBGM();
        this.add.rectangle(180, 320, 360, 640, 0x1a1a1a);

        this.add.text(180, 150, 'OFFICE\nPRANKSTERS', {
            fontSize: '32px', fill: '#fb0', align: 'center', fontFamily: '"Press Start 2P"', stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5);

        this.add.text(180, 220, 'RETRO REVENGE', {
            fontSize: '14px', fill: '#fff', fontFamily: '"Press Start 2P"'
        }).setOrigin(0.5);

        const startBtn = this.add.text(180, 450, 'START GAME', {
            fontSize: '18px', fill: '#fff', backgroundColor: '#a00', padding: 15, fontFamily: '"Press Start 2P"'
        }).setOrigin(0.5).setInteractive();

        startBtn.on('pointerdown', () => {
            SoundManager.playSelect();
            this.scene.start('Level1');
        });

        this.tweens.add({
            targets: startBtn,
            alpha: 0.5,
            duration: 800,
            yoyo: true,
            repeat: -1
        });
    }
}

class BaseLevel extends Phaser.Scene {
    constructor(key) {
        super(key);
    }

    init(data) {
        this.currentRole = 'A';
        this.gameOver = false;
        this.distractionPoint = null;
        this.npcState = 'patrol';
        this.distractionTimer = null;
    }

    preload() {
        this.load.image('office_tiles', 'assets/office.png');
        createTransparentSpritesheet(this, 'char_a', 'assets/char_a.png', 170, 204);
        createTransparentSpritesheet(this, 'char_b', 'assets/char_b.png', 128, 170);
        this.load.spritesheet('npc', 'assets/npc.png', { frameWidth: 256, frameHeight: 256 });
        this.load.spritesheet('jello', 'assets/jello.png', { frameWidth: 64, frameHeight: 64 });
    }

    prankParticles(x, y, color) {
        for (let i = 0; i < 10; i++) {
            const p = this.add.circle(x, y, 4, color).setDepth(30);
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 100;
            this.tweens.add({
                targets: p,
                x: x + Math.cos(angle) * speed,
                y: y + Math.sin(angle) * speed,
                alpha: 0,
                duration: 600,
                onComplete: () => p.destroy()
            });
        }
    }

    createStandardHUD(levelTitle) {
        this.add.rectangle(180, 600, 360, 80, 0x000000, 0.8).setScrollFactor(0).setDepth(90);

        this.portraitA = this.add.sprite(40, 600, 'char_a', 0).setScale(0.3).setScrollFactor(0).setDepth(100);
        this.portraitB = this.add.sprite(320, 600, 'char_b', 0).setScale(0.3).setScrollFactor(0).setDepth(100).setAlpha(0.5);

        this.portraitA.setCrop(0, 0, 170, 150);
        this.portraitB.setCrop(0, 0, 128, 150);

        this.switchButton = this.add.text(180, 615, '🔄 SWAP', {
            fontSize: '14px', fill: '#fff', backgroundColor: '#333', padding: 8, fontFamily: '"Press Start 2P"'
        }).setOrigin(0.5).setInteractive().setScrollFactor(0).setDepth(100);

        this.interactButton = this.add.text(180, 575, '🔥 ACTION', {
            fontSize: '12px', fill: '#fff', backgroundColor: '#a00', padding: 8, fontFamily: '"Press Start 2P"'
        }).setOrigin(0.5).setInteractive().setScrollFactor(0).setDepth(100);

        this.add.text(180, 30, levelTitle, {
            fontSize: '10px', fill: '#fb0', fontFamily: '"Press Start 2P"'
        }).setOrigin(0.5).setDepth(100);

        this.muteButton = this.add.text(180, 50, '🔊', {
            fontSize: '18px', fill: '#fff'
        }).setOrigin(0.5).setInteractive().setScrollFactor(0).setDepth(200);

        this.muteButton.on('pointerdown', () => {
            SoundManager.isMuted = !SoundManager.isMuted;
            if (SoundManager.isMuted) SoundManager.stopBGM();
            else SoundManager.playBGM();
            this.muteButton.setText(SoundManager.isMuted ? '🔇' : '🔊');
        });

        this.restartBtn = this.add.text(180, 80, '🔄 RESTART', {
            fontSize: '8px', fill: '#fff', backgroundColor: '#444', padding: 10, fontFamily: '"Press Start 2P"'
        }).setOrigin(0.5).setInteractive().setScrollFactor(0).setDepth(101);

        this.restartBtn.on('pointerdown', () => {
            SoundManager.playSelect();
            this.scene.restart();
        });

        this.switchButton.on('pointerdown', () => {
            SoundManager.playSelect();
            this.switchPlayer();
        });
        this.interactButton.on('pointerdown', () => {
            SoundManager.playTone(600, 'square', 0.1);
            this.executeAction();
        });

        this.input.addPointer(2);
        this.cursors = this.input.keyboard.createCursorKeys();
        this.visionGraphics = this.add.graphics().setDepth(5);

        if (!this.anims.exists('walk_a')) {
            this.anims.create({ key: 'walk_a', frames: this.anims.generateFrameNumbers('char_a', { start: 0, end: 5 }), frameRate: 10, repeat: -1 });
        }
        if (!this.anims.exists('walk_b')) {
            this.anims.create({ key: 'walk_b', frames: this.anims.generateFrameNumbers('char_b', { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
        }
    }

    switchPlayer() {
        if (this.gameOver) return;
        if (this.currentRole === 'A') {
            this.player = this.charB;
            this.currentRole = 'B';
            this.charA.setAlpha(0.6);
            this.charB.setAlpha(1.0);
            this.charA.setVelocity(0);
            this.portraitA.setAlpha(0.5);
            this.portraitB.setAlpha(1.0);
        } else {
            this.player = this.charA;
            this.currentRole = 'A';
            this.charA.setAlpha(1.0);
            this.charB.setAlpha(0.6);
            this.charB.setVelocity(0);
            this.portraitA.setAlpha(1.0);
            this.portraitB.setAlpha(0.5);
        }
    }

    handleMovement() {
        const speed = (this.currentRole === 'A') ? 180 : 120;
        this.player.setVelocity(0);

        if (this.cursors.left.isDown) this.player.setVelocityX(-speed);
        else if (this.cursors.right.isDown) this.player.setVelocityX(speed);
        if (this.cursors.up.isDown) this.player.setVelocityY(-speed);
        else if (this.cursors.down.isDown) this.player.setVelocityY(speed);

        const pointer = this.input.activePointer;
        if (pointer.isDown && pointer.y < 550 && pointer.y > 50) {
            const dx = pointer.x - this.player.x;
            const dy = pointer.y - this.player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 20) {
                this.player.setVelocityX((dx / dist) * speed);
                this.player.setVelocityY((dy / dist) * speed);
            }
        }

        if (this.player.body.velocity.x !== 0 || this.player.body.velocity.y !== 0) {
            this.player.play(this.currentRole === 'A' ? 'walk_a' : 'walk_b', true);
            this.player.flipX = this.player.body.velocity.x < 0;
        } else {
            this.player.stop();
            this.player.setFrame(0);
        }
    }

    handleNPC() {
        if (this.npcState === 'distracted') {
            const dx = this.distractionPoint.x - this.npc.x;
            const dy = this.distractionPoint.y - this.npc.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 10) {
                this.npc.setVelocity(0);
                if (!this.distractionTimer) {
                    this.distractionTimer = this.time.delayedCall(3000, () => {
                        this.npcState = 'patrol';
                        this.distractionPoint = null;
                        this.distractionTimer = null;
                    });
                }
            } else {
                this.npc.setVelocityX((dx / dist) * 120);
                this.npc.setVelocityY((dy / dist) * 120);
            }
        } else {
            const target = this.npc.patrolPath[this.npc.pathIndex];
            const dx = target.x - this.npc.x;
            const dy = target.y - this.npc.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 5) {
                this.npc.pathIndex = (this.npc.pathIndex + 1) % this.npc.patrolPath.length;
            } else {
                this.npc.setVelocityX((dx / dist) * 60);
                this.npc.setVelocityY((dy / dist) * 60);
            }
        }
        this.npc.flipX = this.npc.body.velocity.x < 0;
    }

    checkStealth() {
        this.visionGraphics.clear();
        this.visionGraphics.fillStyle(0xffff00, 0.2);
        const angle = Math.atan2(this.npc.body.velocity.y, this.npc.body.velocity.x);
        const range = 150;
        const fov = Math.PI / 3;
        this.visionGraphics.beginPath();
        this.visionGraphics.moveTo(this.npc.x, this.npc.y);
        this.visionGraphics.arc(this.npc.x, this.npc.y, range, angle - fov / 2, angle + fov / 2);
        this.visionGraphics.lineTo(this.npc.x, this.npc.y);
        this.visionGraphics.fill();
        const dx = this.player.x - this.npc.x;
        const dy = this.player.y - this.npc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angleToPlayer = Math.atan2(dy, dx);
        const angleDiff = Phaser.Math.Angle.ShortestBetween(angle * 180 / Math.PI, angleToPlayer * 180 / Math.PI);
        if (dist < range && Math.abs(angleDiff) < 30) {
            SoundManager.playBust();
            this.alertGameOver();
        }
    }

    alertGameOver() {
        if (this.gameOver) return;
        this.gameOver = true;
        this.cameras.main.shake(500, 0.02);
        this.player.setVelocity(0);
        this.npc.setVelocity(0);
        this.add.text(180, 320, 'BUSTED!', {
            fontSize: '32px', fill: '#f00', stroke: '#000', strokeThickness: 4, fontFamily: '"Press Start 2P"'
        }).setOrigin(0.5).setDepth(200);
        this.input.on('pointerdown', () => this.scene.restart());
    }
}

class Level1 extends BaseLevel {
    constructor() {
        super('Level1');
    }

    create() {
        this.cameras.main.setBackgroundColor('#2d2d2d');
        this.createStandardHUD('LEVEL 1: DESK PRANK');
        this.targetZone = this.add.rectangle(300, 100, 60, 60, 0x00ff00, 0.3);
        this.add.text(300, 100, 'STORAGE', { fontSize: '10px', fill: '#fff', fontFamily: '"Press Start 2P"' }).setOrigin(0.5);
        this.desk = this.physics.add.sprite(180, 250, 'office_tiles', 0).setScale(0.2);
        this.desk.setImmovable(false);
        this.npc = this.physics.add.sprite(250, 200, 'npc', 0).setScale(0.3);
        this.npc.patrolPath = [{ x: 250, y: 200 }, { x: 50, y: 200 }, { x: 50, y: 400 }, { x: 250, y: 400 }];
        this.npc.pathIndex = 0;
        this.charA = this.physics.add.sprite(50, 500, 'char_a', 0).setScale(0.2);
        this.charB = this.physics.add.sprite(100, 500, 'char_b', 0).setScale(0.2);
        this.charA.setCollideWorldBounds(true);
        this.charB.setCollideWorldBounds(true);
        this.physics.add.collider(this.charA, this.desk);
        this.physics.add.collider(this.charB, this.desk);
        this.player = this.charA;
        this.charB.setAlpha(0.6);
    }

    executeAction() {
        if (this.gameOver) return;
        if (this.currentRole === 'A') {
            this.distractionPoint = { x: this.player.x, y: this.player.y };
            this.npcState = 'distracted';
            const ping = this.add.circle(this.player.x, this.player.y, 40, 0xffffff, 0.5);
            this.tweens.add({ targets: ping, scale: 2, alpha: 0, duration: 500, onComplete: () => ping.destroy() });
        } else {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.desk.x, this.desk.y);
            if (dist < 60) {
                const angle = Math.atan2(this.desk.y - this.player.y, this.desk.x - this.player.x);
                this.desk.setVelocity(Math.cos(angle) * 150, Math.sin(angle) * 150);
                this.time.delayedCall(300, () => { if (this.desk.body) this.desk.setVelocity(0) });
            }
        }
    }

    update() {
        if (this.gameOver) return;
        this.handleMovement();
        this.handleNPC();
        this.checkStealth();
        const dist = Phaser.Math.Distance.Between(this.desk.x, this.desk.y, this.targetZone.x, this.targetZone.y);
        if (dist < 40) {
            this.gameOver = true;
            SoundManager.playWin();
            this.add.text(180, 320, 'PRANK 1 DONE!', { fontSize: '20px', fill: '#0f0', fontFamily: '"Press Start 2P"' }).setOrigin(0.5);
            this.time.delayedCall(2000, () => this.scene.start('Level2'));
        }
    }
}

class Level2 extends BaseLevel {
    constructor() {
        super('Level2');
    }

    create() {
        this.cameras.main.setBackgroundColor('#2d2d2d');
        this.createStandardHUD('LEVEL 2: JELLO TRAP');
        this.stapler = this.physics.add.sprite(180, 150, 'jello', 0).setScale(1.0);
        this.stapler.isPranked = false;
        this.npc = this.physics.add.sprite(50, 150, 'npc', 0).setScale(0.3);
        this.npc.patrolPath = [{ x: 50, y: 150 }, { x: 310, y: 150 }];
        this.npc.pathIndex = 0;
        this.charA = this.physics.add.sprite(50, 500, 'char_a', 0).setScale(0.2);
        this.charB = this.physics.add.sprite(100, 500, 'char_b', 0).setScale(0.2);
        this.charA.setCollideWorldBounds(true);
        this.charB.setCollideWorldBounds(true);
        this.player = this.charA;
        this.charB.setAlpha(0.6);
    }

    executeAction() {
        if (this.gameOver) return;
        if (this.currentRole === 'A') {
            this.distractionPoint = { x: this.player.x, y: this.player.y };
            this.npcState = 'distracted';
            const ping = this.add.circle(this.player.x, this.player.y, 40, 0xffffff, 0.5);
            this.tweens.add({ targets: ping, scale: 2, alpha: 0, duration: 500, onComplete: () => ping.destroy() });
        } else {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.stapler.x, this.stapler.y);
            if (dist < 50) {
                this.stapler.setFrame(1);
                this.stapler.isPranked = true;
                this.prankParticles(this.stapler.x, this.stapler.y, 0xff8800);
                this.add.text(this.stapler.x, this.stapler.y - 40, 'JELLO!', { fontSize: '8px', fill: '#f80', fontFamily: '"Press Start 2P"' }).setOrigin(0.5);
            }
        }
    }

    update() {
        if (this.gameOver) return;
        this.handleMovement();
        this.handleNPC();
        this.checkStealth();
        if (this.stapler.isPranked && Phaser.Math.Distance.Between(this.npc.x, this.npc.y, this.stapler.x, this.stapler.y) < 50) {
            this.gameOver = true;
            SoundManager.playWin();
            this.add.text(180, 320, 'JELLO TRAP SUCCESS!', { fontSize: '16px', fill: '#0f0', fontFamily: '"Press Start 2P"' }).setOrigin(0.5);
            this.time.delayedCall(3000, () => this.scene.start('Level3'));
        }
    }
}

class Level3 extends BaseLevel {
    constructor() {
        super('Level3');
        this.alarmTriggered = false;
    }

    create() {
        this.cameras.main.setBackgroundColor('#2d2d2d');
        this.createStandardHUD('LEVEL 3: FIRE DRILL');
        this.lever = this.add.rectangle(180, 100, 20, 30, 0xbb0000).setInteractive();
        this.exitDoor = this.add.rectangle(330, 350, 40, 80, 0x442200);
        this.npc = this.physics.add.sprite(300, 350, 'npc', 0).setScale(0.3);
        this.npc.patrolPath = [{ x: 300, y: 350 }, { x: 300, y: 150 }];
        this.npc.pathIndex = 0;
        this.charA = this.physics.add.sprite(50, 500, 'char_a', 0).setScale(0.2);
        this.charB = this.physics.add.sprite(100, 500, 'char_b', 0).setScale(0.2);
        this.charA.setCollideWorldBounds(true);
        this.charB.setCollideWorldBounds(true);
        this.player = this.charA;
        this.charB.setAlpha(0.6);
        this.alarmGraphics = this.add.graphics().setDepth(150);
    }

    executeAction() {
        if (this.gameOver) return;
        if (this.currentRole === 'A') {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.lever.x, this.lever.y);
            if (dist < 50) this.triggerAlarm();
            else {
                this.distractionPoint = { x: this.player.x, y: this.player.y };
                this.npcState = 'distracted';
                const ping = this.add.circle(this.player.x, this.player.y, 40, 0xffffff, 0.5);
                this.tweens.add({ targets: ping, scale: 2, alpha: 0, duration: 500, onComplete: () => ping.destroy() });
            }
        }
    }

    triggerAlarm() {
        if (this.alarmTriggered) return;
        this.alarmTriggered = true;
        this.lever.setFillStyle(0x00ff00);
        this.npcState = 'panic';
        this.npc.patrolPath = [{ x: 50, y: 50 }];
        this.npc.pathIndex = 0;
        this.prankParticles(this.lever.x, this.lever.y, 0xff0000);
        this.time.addEvent({
            delay: 500,
            callback: () => {
                this.alarmGraphics.clear();
                if (Math.random() > 0.5) { this.alarmGraphics.fillStyle(0xff0000, 0.1); this.alarmGraphics.fillRect(0, 0, 360, 640); }
            },
            loop: true
        });
    }

    handleNPC() {
        if (this.npcState === 'panic') {
            const target = this.npc.patrolPath[0];
            const dx = target.x - this.npc.x, dy = target.y - this.npc.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 5) { this.npc.setVelocityX((dx / dist) * 150); this.npc.setVelocityY((dy / dist) * 150); }
            else { this.npc.setVelocity(0); }
        } else super.handleNPC();
        this.npc.flipX = this.npc.body.velocity.x < 0;
    }

    update() {
        if (this.gameOver) return;
        this.handleMovement(); this.handleNPC(); this.checkStealth();
        if (this.alarmTriggered && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.exitDoor.x, this.exitDoor.y) < 50) {
            this.gameOver = true; SoundManager.playWin();
            this.time.delayedCall(2000, () => this.scene.start('Level4'));
        }
    }
}

class Level4 extends BaseLevel {
    constructor() { super('Level4'); }

    create() {
        this.cameras.main.setBackgroundColor('#2d2d2d');
        this.createStandardHUD('LEVEL 4: MEGADESK');
        this.desks = this.physics.add.group();
        [{ x: 100, y: 150 }, { x: 260, y: 150 }, { x: 180, y: 350 }].forEach(pos => {
            const d = this.desks.create(pos.x, pos.y, 'office_tiles', 0).setScale(0.2);
            d.setDrag(500);
        });
        this.targetZone = this.add.rectangle(180, 150, 200, 100, 0x00ff00, 0.2);
        this.npc = this.physics.add.sprite(180, 450, 'npc', 0).setScale(0.3);
        this.npc.patrolPath = [{ x: 50, y: 450 }, { x: 310, y: 450 }];
        this.charA = this.physics.add.sprite(50, 550, 'char_a', 0).setScale(0.2);
        this.charB = this.physics.add.sprite(100, 550, 'char_b', 0).setScale(0.2);
        this.charA.setCollideWorldBounds(true); this.charB.setCollideWorldBounds(true);
        this.physics.add.collider(this.charA, this.desks); this.physics.add.collider(this.charB, this.desks);
        this.physics.add.collider(this.desks, this.desks);
        this.player = this.charA; this.charB.setAlpha(0.6);
    }

    executeAction() {
        if (this.gameOver) return;
        if (this.currentRole === 'A') {
            this.distractionPoint = { x: this.player.x, y: this.player.y };
            this.npcState = 'distracted';
            const ping = this.add.circle(this.player.x, this.player.y, 40, 0xffffff, 0.5);
            this.tweens.add({ targets: ping, scale: 2, alpha: 0, duration: 500, onComplete: () => ping.destroy() });
        } else {
            this.desks.getChildren().forEach(desk => {
                if (Phaser.Math.Distance.Between(this.player.x, this.player.y, desk.x, desk.y) < 60) {
                    const angle = Math.atan2(desk.y - this.player.y, desk.x - this.player.x);
                    desk.setVelocity(Math.cos(angle) * 180, Math.sin(angle) * 180);
                    this.time.delayedCall(400, () => { if (desk.body) desk.setVelocity(0) });
                }
            });
        }
    }

    update() {
        if (this.gameOver) return;
        this.handleMovement(); this.handleNPC(); this.checkStealth();
        let inZone = 0; const bounds = this.targetZone.getBounds();
        this.desks.getChildren().forEach(d => { if (Phaser.Geom.Intersects.RectangleToRectangle(d.getBounds(), bounds)) { inZone++; d.setTint(0x00ff00); } else d.clearTint(); });
        if (inZone === 3) { this.gameOver = true; SoundManager.playWin(); this.time.delayedCall(2000, () => this.scene.start('Level5')); }
    }
}

class Level5 extends BaseLevel {
    constructor() { super('Level5'); }

    create() {
        this.cameras.main.setBackgroundColor('#1a1a1a');
        this.createStandardHUD('LEVEL 5: FINAL PRANK');
        this.coffee = this.add.circle(180, 150, 10, 0x663300).setDepth(20);
        this.npc = this.physics.add.sprite(180, 150, 'npc', 0).setScale(0.3);
        this.npc.patrolPath = [{ x: 180, y: 150 }, { x: 100, y: 150 }, { x: 260, y: 150 }];
        this.charA = this.physics.add.sprite(50, 550, 'char_a', 0).setScale(0.2);
        this.charB = this.physics.add.sprite(310, 550, 'char_b', 0).setScale(0.2);
        this.player = this.charA; this.charB.setAlpha(0.6);
    }

    executeAction() {
        if (this.gameOver) return;
        if (this.currentRole === 'A') {
            this.distractionPoint = { x: 250, y: 400 }; this.npcState = 'distracted';
            const ping = this.add.circle(250, 400, 40, 0x00ffff, 0.5);
            this.tweens.add({ targets: ping, scale: 2, alpha: 0, duration: 1000, onComplete: () => ping.destroy() });
        } else {
            if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.coffee.x, this.coffee.y) < 40) {
                this.coffee.setFillStyle(0x00ff00); this.coffee.isPranked = true;
                this.prankParticles(this.coffee.x, this.coffee.y, 0x00ff00);
            }
        }
    }

    update() {
        if (this.gameOver) return;
        this.handleMovement(); this.handleNPC(); this.checkStealth();
        if (this.coffee.isPranked && Phaser.Math.Distance.Between(this.npc.x, this.npc.y, this.coffee.x, this.coffee.y) < 20) {
            this.gameOver = true; SoundManager.playWin();
            this.time.delayedCall(4000, () => this.scene.start('WinScene'));
        }
    }
}

class WinScene extends Phaser.Scene {
    constructor() { super('WinScene'); }
    create() {
        this.add.rectangle(180, 320, 360, 640, 0x1a1a1a);
        this.add.text(180, 200, 'YOU WON!', { fontSize: '32px', fill: '#fb0', fontFamily: '"Press Start 2P"' }).setOrigin(0.5);
        const btn = this.add.text(180, 450, 'PLAY AGAIN', { fontSize: '14px', fill: '#fff', backgroundColor: '#a00', padding: 15, fontFamily: '"Press Start 2P"' }).setOrigin(0.5).setInteractive();
        btn.on('pointerdown', () => { SoundManager.playSelect(); this.scene.start('MenuScene'); });
    }
}

const finalGameInstance = new Phaser.Game({ ...config, scene: [MenuScene, Level1, Level2, Level3, Level4, Level5, WinScene] });
