'use strict';
// Word lists. Format: "word" or "word=alias/alias" (aliases are also accepted as correct guesses).
const split = (s) => s.split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const [w, a] = x.split('='); return { word: w.trim(), aliases: a ? a.split('/').map((y) => y.trim()) : [] }; });

const EMOTIONS = `happy=happiness,sad=sadness,angry=anger/mad,joy=joyful,love,fear=scared/afraid,excited=excitement,nervous=nervousness/anxious,lonely=loneliness,jealous=jealousy/envy,proud=pride,
embarrassed=embarrassment,bored=boredom,surprised=surprise/shocked,disgusted=disgust,guilty=guilt,grateful=gratitude/thankful,hopeful=hope,anxious=anxiety/worried,calm=calmness/peaceful,
confused=confusion,curious=curiosity,content=contentment,delighted=delight,disappointed=disappointment/let down,ecstatic,furious=rage/enraged,frustrated=frustration,gloomy,heartbroken=heartbreak/broken hearted,
homesick=homesickness,hopeless=despair,hurt,inspired=inspiration,insecure=insecurity,irritated=annoyed/annoyance,melancholy=melancholic/wistful,miserable=misery,nostalgic=nostalgia,
optimistic=optimism,overwhelmed,panicked=panic,passionate=passion,playful,pleased,relieved=relief,remorse=remorseful/regret,resentful=resentment,restless,romantic=romance,satisfied=satisfaction,
serene=serenity,shy=shyness,smug,stressed=stress,sympathy=sympathetic,terrified=terror,thrilled,tired=exhausted/exhaustion,triumphant=triumph,uneasy=unease,vengeful=revenge,vulnerable,weary,
worried=worry,yearning=longing,zen,amazed=amazement,amused=amusement,anticipation=expectant,awe=awestruck,bitter=bitterness,blissful=bliss,brave=bravery/courage,cheerful,cozy=comfy,defeated=defeat,
determined=determination,devastated=devastation,eager=eagerness,empty=emptiness/numb,empowered=empowerment,enchanted,energetic=energy,enthusiastic=enthusiasm,euphoric=euphoria,fascinated=fascination,
fed up,festive,flustered,fulfilled=fulfillment,giddy,glad,grief=grieving/mourning,grumpy=cranky,hesitant=hesitation,humble=humility,humiliated=humiliation,hyped,impatient=impatience,indifferent=indifference,
infatuated=infatuation,intimidated,isolated=isolation,jubilant,kind=kindness,laid back=relaxed/chill,loved,lovesick,lucky,mellow,mischievous=mischief,moody,motivated=motivation,mournful,
obsessed=obsession,overjoyed,paranoid=paranoia,peaceful=peace,petrified,pity,powerful,protective,rebellious=rebellion,refreshed,regretful,reluctant,rejected=rejection,rushed,sassy,scornful,
self-conscious,sentimental,skeptical=skepticism,sleepy,sorrow=sorrowful,spooked,startled,suspicious=suspicion,sweet,tender=tenderness,tense=tension,thoughtful,torn,trusting=trust,
unstoppable,unsure=uncertain,upset,warm,wonder=wonderment,wounded,wrathful=wrath,adoration=adoring,desire,heartache,ease,dread,elation,glee,ambivalent=ambivalence,affection=affectionate,
apathetic=apathy,betrayed=betrayal,carefree,charmed,comforted=comfort,conflicted,cheeky,dazed,distraught,dreamy,fearless,flirty,fond,forgiving=forgiveness,gutted,haunted,heavy-hearted,
helpless,high-spirited,hysterical,idealistic,jaded,lively,melodramatic,mesmerized,nauseous,overconfident=cocky,patient=patience,possessive,reckless,relaxed,sheepish,solemn,stunned,thankful,timid`;

const ADJECTIVES = `ancient=old/antique,bright=brightness,broken,bumpy,chaotic=chaos,cold=freezing,colorful=colourful,crowded=packed,cute=adorable,dangerous=danger,dark=darkness,deep,delicate=fragile,dirty=filthy,
dizzy,dramatic=drama,dusty,elegant=elegance,enormous=huge/giant,faint,fast=quick/speedy,fierce,fluffy,foggy=fog,fresh,friendly,frozen,fuzzy,gentle=gentleness,glamorous=glamour,
glossy=shiny,graceful=grace,greasy,grim,gritty,heavy,hidden,hollow,hot=boiling,hungry=hunger,icy=ice,innocent=innocence,jagged,juicy,lazy=laziness,light=lightweight,loud=noisy,
lush,magical=magic,massive,messy=mess,mighty,miniature=tiny/small,mysterious=mystery,narrow,neat=tidy,odd=strange/weird,perfect=perfection,pointy=sharp,polite,
precious,quiet=silent,rainy=rain,rapid,raw,rich=wealthy,rough,round,royal,rusty=rust,sacred,sandy,scary=frightening,scratchy,secret,shadowy,shaky,silky=smooth,simple,slippery,slow,
smoky=smoke,soft=softness,solid,sparkly=sparkling/glittery,spicy=hot and spicy,spooky=creepy,squishy,steamy,sticky,stormy=storm,stubborn=stubbornness,sunny=sunshine,tall,thick,thin,thorny,
thrilling,tropical,twisted,ugly,unusual,vast,velvet=velvety,vibrant=vivid,weightless,wet=soaked/damp,wild=untamed,windy=wind,wooden,wrinkled,youthful=young,
adventurous=adventure,aggressive,alive,ambitious=ambition,awkward=awkwardness,bold=boldness,boring=dull,breezy,brilliant,brisk,bubbly,careful,cheap,classic,clever=smart,
clumsy,confident=confidence,cool=chilly,crazy=insane,creative=creativity,cruel=cruelty,daring,dazzling,decadent=decadence,delicious=tasty/yummy,dreadful=awful/terrible,
electric=electrifying,epic,eternal=forever/everlasting,exotic,famous=fame,fancy=luxurious/luxury,flawless,flimsy,foolish=silly,forgotten,futuristic=future,generous=generosity,
ghostly,gigantic,glorious,golden,gorgeous=beautiful,grand=grandiose,gross,hairy,hazy,heroic=hero,holy,honest=honesty,intense=intensity,jolly,lavish,legendary=legend,
majestic=majesty,modern,muddy=mud,nasty,naughty,obnoxious,open,pale,pretty,regal,rhythmic=rhythm,
ruthless,savage,sinister=evil,sleek,sloppy,sneaky,sour,spacious,spontaneous=spontaneity,stylish=style,sultry,sweaty,tragic=tragedy,upbeat,uplifting,vintage=retro,
wacky,whimsical=whimsy,wicked,wise=wisdom,witty,zany,zesty,agile,ample,arid=dry,austere,bare,barren,blazing,bleak,blunt,bouncy,brittle,bustling,cavernous,chilly,clean,cluttered,compact,cramped,
crisp,crooked,crumbly,curly,dainty,dapper,dim,distant,drab,drowsy,dull,earthy,eerie,faded,feathery,feeble,fertile,flat,flickering,floral,fragrant,frosty,gaudy,gleaming,gloomy,grainy,groovy,hasty,
humid,hushed,immense,jittery,knotty,leafy,limp,lumpy,luminous,marbled,meek,mossy,murky,nimble,oily,ornate,pastel,plush,pungent,quaint,radiant,ragged,rugged,scorching,serrated,shimmering,sleepless,
snug,spiky,stale,sterile,stuffy,sturdy,sunlit,swampy,tangled,tattered,tiny,toasty,tranquil,translucent,turbulent,vacant,weathered,wobbly,woolly`;

const SCENARIOS = `road trip=roadtrip,first date,breakup=break up,wedding=getting married,graduation=graduating,job interview,late for work=running late,winning the lottery=lottery win,moving out=moving house/moving day,
first day of school=back to school,birthday party=birthday,funeral=burial,heist=bank robbery,car chase=chase scene,sunrise,sunset,rainy day,snow day=snowstorm,beach day=day at the beach,camping trip=camping,
stuck in traffic=traffic jam,rush hour,morning commute=commute,coffee shop=cafe,gym workout=working out/workout,cooking dinner=making dinner,family dinner,thanksgiving,christmas morning=christmas,new years eve=new year/new years,
halloween night=halloween,fireworks,carnival=fair,county fair,amusement park=theme park/roller coaster,airport goodbye=saying goodbye,long flight=flight,lost in a city=lost in the city,midnight drive=night drive,
walk of shame,hangover,all nighter=pulling an all nighter/staying up all night,cramming for exams=studying/exam,first kiss,proposal=getting engaged/engagement,honeymoon,baby shower,newborn baby=having a baby,
family reunion=reunion,high school reunion,prom night=prom,school dance=dance,talent show,job promotion=promotion,getting fired=fired/losing my job,retirement party=retirement,quitting your job=quitting,
winning the game=big win,losing the game=big loss,championship=championship game,marathon=running a marathon,penalty kick=shootout,final exam,detention,skipping school=ditching class,sleepover,
slumber party,food fight,water balloon fight,pillow fight,snowball fight,building a snowman,sandcastle=building a sandcastle,picnic,barbecue=bbq/cookout,tailgate,backyard party=house party,rooftop party,
nightclub=night out/clubbing,karaoke night=karaoke,open mic,street performance=busking,concert=live concert,music festival=festival,backstage,tour bus,recording studio,movie night=watching a movie,
horror movie=scary movie,cinema=movie theater,rom com=romantic comedy,western showdown=duel,space launch=rocket launch,moon landing,deep sea dive=scuba diving,mountain climb=climbing a mountain/hiking,
desert crossing=walking through the desert,jungle expedition=jungle,safari,shipwreck=ship wreck,island getaway=desert island,treasure hunt,haunted house,ghost story,campfire stories=campfire,
thunderstorm=storm,hurricane,earthquake,blackout=power outage,flat tire=car trouble,breaking down=broken down car,hitchhiking,train ride=train journey,subway ride=subway,bus ride=bus,taxi ride=cab ride,
boat ride=sailing,bike ride=cycling,rollerblading=roller skating,skateboarding=skating,surfing,skiing=ski trip,sledding,ice skating,fishing trip=fishing,hunting trip,farm life=life on the farm,harvest,
small town=small town life,big city=city life,new york city,hollywood,las vegas=vegas,paris,tokyo,london,hawaii,california=cali,texas,country road,highway,back alley=alley,rooftop,subway platform,
laundromat,diner=late night diner,grocery store=grocery shopping,shopping spree=shopping,black friday,garage sale=yard sale,flea market,library=studying at the library,classroom,principals office,
waiting room=hospital waiting room,emergency room=er,doctor visit=doctors office,dentist=dentist visit,haircut=getting a haircut,makeover=glow up,getting dressed=getting ready,red carpet,fashion show=runway,
art gallery=museum,painting=painting a picture,dance floor=dancing,slow dance,tango,ballroom=ballroom dance,wedding dance=first dance,lullaby=bedtime,bedtime=going to bed,waking up=morning alarm,
sleeping in=lazy morning,sunday morning,monday morning=monday,friday night=friday,saturday night=saturday,summer vacation=summer break,summer romance=summer love,spring cleaning,autumn leaves=fall,winter wonderland=winter,
heartbreak hotel,runaway bride=cold feet,love triangle,long distance relationship=long distance,airport reunion=reunion at the airport,coming home=homecoming,leaving home=leaving home for the first time,
moving to a new city=moving to a new town,new beginnings=fresh start,starting over,comeback=comeback story,underdog story=underdog,hero's journey=heros welcome,villain's entrance=villain,plot twist,
cliffhanger,final boss=boss battle,video game=gaming,arcade,board game night=game night,poker night=poker,casino=gambling,detective=detective story,spy mission=spy,undercover=undercover mission,
prison break=jailbreak,courtroom=trial,police chase=cops chasing,getaway=getaway car,superhero=superhero landing,zombie apocalypse=zombies,alien invasion=aliens,robot uprising=robots,time travel,
parallel universe=multiverse,fairy tale=once upon a time,knight in shining armor=knight,dragon fight=fighting a dragon,pirate ship=pirates,wild west=cowboys,medieval feast=castle,gladiator arena=gladiators`;

const CATEGORIES = { emotions: split(EMOTIONS), adjectives: split(ADJECTIVES), scenarios: split(SCENARIOS) };
const LABELS = { emotions: 'Emotions', adjectives: 'Adjectives', scenarios: 'Scenarios' };
// de-duplicate within a category
for (const k of Object.keys(CATEGORIES)) { const seen = new Set(); CATEGORIES[k] = CATEGORIES[k].filter((w) => !seen.has(w.word.toLowerCase()) && seen.add(w.word.toLowerCase())); }
const meta = () => Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, { label: LABELS[k], count: CATEGORIES[k].length }]));
module.exports = { CATEGORIES, meta };
