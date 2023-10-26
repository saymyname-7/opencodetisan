import {UserRole} from '@/enums'
import {getAssessment} from '@/lib/core/assessment'
import {getCandidate} from '@/lib/core/candidate'
import {
  acceptAssessmentService,
  addAssessmentCandidateService,
  createAssessmentService,
  createCandidateSubmissionService,
  createQuizService,
  deleteAssessmentService,
  deleteQuizService,
  getAssessmentService,
  getManyAssessmentService,
  updateAssessmentDataService,
  updateCandidateSubmissionService,
} from '@/lib/core/service'
import {createUser} from '@/lib/core/user'
import prisma from '@/lib/db/client'
import {IUserProps} from '@/types'
import {faker} from '@faker-js/faker'
import {DateTime} from 'luxon'
import {inspect} from 'node:util'

jest.mock('nodemailer')
import nodemailer from 'nodemailer'

const sendMailMock = jest.fn()
// TODO: fix type error
// @ts-ignore
nodemailer.createTransport.mockReturnValue({sendMail: sendMailMock})

const nodemailerResponse = {
  accepted: ['example@gmail.com'],
  rejected: [],
  ehlo: [],
  envelopeTime: faker.number.int(),
  messageTime: faker.number.int(),
  messageSize: faker.number.int(),
  response: faker.lorem.text(),
  envelope: {from: 'example@gmail.com', to: ['example@gmail.com']},
  messageId: faker.lorem.text(),
}

const inspectItem = (item: any) => {
  console.log(
    inspect(item, {
      showHidden: false,
      depth: null,
      colors: true,
    }),
  )
}

const createFakeQuizzes = async ({
  quizId,
  userId,
  difficultyLevelId,
  codeLanguageId,
}: {
  quizId: string
  userId: string
  difficultyLevelId: number
  codeLanguageId: number
}) => {
  await prisma.quiz.create({
    data: {
      id: quizId,
      title: faker.lorem.text(),
      userId,
      codeLanguageId,
      difficultyLevelId,
    },
  })
}

const createManyFakeDifficultyLevel = async (
  difficultyLevels: {id: number; name: string}[],
) => {
  await prisma.difficultyLevel.createMany({data: difficultyLevels})
}

const createManyFakeCodeLanguage = async (
  codeLanguages: {id: number; name: string}[],
) => {
  await prisma.codeLanguage.createMany({data: codeLanguages})
}

const createFakeAssessmentPoint = async () => {
  const assessmentPoints = [
    {name: 'easyQuizCompletionPoint', point: 1000},
    {name: 'speedPoint', point: 500},
  ]

  const assessmentPointPromises: Promise<any>[] = []

  assessmentPoints.forEach((p) => {
    assessmentPointPromises.push(
      prisma.assessmentPoint.create({
        data: {
          name: p.name,
          point: p.point,
        },
      }),
    )
  })

  return await Promise.all(assessmentPointPromises)
}

const createFakeUsers = async () => {
  const promises: Promise<any>[] = []
  const uuids = [faker.string.uuid(), faker.string.uuid()]
  uuids.forEach((id) => {
    promises.push(
      prisma.user.create({data: {id, name: faker.lorem.word(), email}}),
    )
  })
  return Promise.all(promises)
}

const createFakeCandidateSubmission = async ({
  assessmentId,
  quizId,
  userId,
  code,
}: {
  assessmentId: string
  quizId: string
  userId: string
  code: string
}) => {
  const createdSubmission = await createCandidateSubmissionService({
    assessmentId,
    quizId,
    userId,
  })
  const assessmentResult = createdSubmission?.updatedAssessmentResult

  for (
    let i = 0;
    i < assessmentResult?.assessmentQuizSubmissions.length!;
    i++
  ) {
    const updatedSubmission = await updateCandidateSubmissionService({
      userId,
      quizId,
      code,
      assessmentQuizSubmissionId: assessmentResult?.assessmentQuizSubmissions[i]
        .id as string,
    })
  }
}

let assessmentPoints

describe('Integration test: Assessment', () => {
  const difficultyLevels = [
    {id: faker.number.int({min: 1, max: 100}), name: 'easy'},
  ]
  const difficultyLevelIds = difficultyLevels.map((d) => d.id)

  beforeAll(async () => {
    sendMailMock.mockClear()
    // TODO: fix type error
    // @ts-ignore
    nodemailer.createTransport.mockClear()
    assessmentPoints = await createFakeAssessmentPoint()
    await createManyFakeDifficultyLevel(difficultyLevels)
    await prisma.userAction.createMany({
      data: [
        {id: 1, userAction: 'accept'},
        {id: 2, userAction: 'complete'},
      ],
    })
  })

  afterAll(async () => {
    await prisma.candidateActivityLog.deleteMany()
    await prisma.userAction.deleteMany({where: {id: {in: [1, 2]}}})
    await prisma.difficultyLevel.deleteMany({
      where: {id: {in: difficultyLevelIds}},
    })
  })

  describe('Integration test: createAssessmentService', () => {
    const uuid = faker.string.uuid()
    const email = faker.internet.email()
    const word = faker.lorem.word()
    const userId = faker.string.uuid()
    const codeLanguageId = faker.number.int(1000)
    const difficultyLevelId = faker.number.int(1000)
    const quizId = faker.string.uuid()
    let quizzes: any[]
    let user: IUserProps
    let assessmentId: string

    beforeAll(async () => {
      const createQuizPromises: Promise<any>[] = []

      await prisma.user.create({data: {id: userId, name: word, email}})
      await prisma.codeLanguage.create({data: {id: codeLanguageId, name: word}})
      await prisma.difficultyLevel.create({
        data: {id: difficultyLevelId, name: word},
      })
      Array(2).forEach(() => {
        createQuizPromises.push(
          prisma.quiz.create({
            data: {
              id: quizId,
              title: word,
              userId: user.id,
              codeLanguageId,
              difficultyLevelId,
            },
          }),
        )
      })
      quizzes = await Promise.all(createQuizPromises)
    })

    afterAll(async () => {
      const deleteQuizPromises: Promise<any>[] = []

      await prisma.assessmentQuiz.deleteMany({where: {quizId}})
      await prisma.assessment.delete({where: {id: assessmentId}})
      quizzes.forEach((q) => {
        deleteQuizPromises.push(prisma.quiz.delete({where: {id: q.id}}))
      })
      await Promise.all(deleteQuizPromises)
      await prisma.codeLanguage.delete({where: {id: codeLanguageId}})
      await prisma.difficultyLevel.delete({where: {id: difficultyLevelId}})
      await prisma.user.delete({where: {id: userId}})
    })

    test('it should create a new assessment', async () => {
      const quizIds = quizzes.map((q) => q.id)
      const assessment = await createAssessmentService({
        userId: user.id,
        title: word,
        description: word,
        quizIds,
        startAt: faker.date.past().toISOString(),
        endAt: faker.date.future().toISOString(),
      })

      assessmentId = assessment.id
      const expectedAssessment = await getAssessment({assessmentId})

      expect(assessment).toEqual(expectedAssessment?.data)
    })
  })

  describe('Integration test: createCandidateSubmissionService', () => {
    const text = faker.lorem.text()
    const number = faker.number.int({min: 1, max: 3866627})
    const userId = faker.string.uuid()
    const codeLanguageId = faker.number.int(1000)
    const email = faker.internet.email()
    let user: any
    let quiz: any
    let createdAssessment: Record<string, any>
    let assessmentPoints: Record<string, any>[]
    let assessmentQuizSubmissionId: string

    beforeAll(async () => {
      user = await prisma.user.create({
        data: {id: userId, name: faker.lorem.word(), email},
      })
      await prisma.codeLanguage.create({
        data: {id: codeLanguageId, name: text},
      })
      await prisma.difficultyLevel.create({
        data: {id: difficultyLevelId, name: text},
      })
      quiz = await createQuizService({
        quizData: {
          userId: user.id,
          title: text,
          answer: text,
          locale: text,
          defaultCode: text,
          instruction: text,
          codeLanguageId,
          difficultyLevelId,
        },
        quizSolution: [
          {
            code: text,
            sequence: 0,
            testRunner: text,
            importDirectives: text,
          },
        ],
        quizTestCases: [[{input: text, output: text}]],
      })
      createdAssessment = await createAssessmentService({
        userId: user.id,
        title: text,
        description: text,
        quizIds: [quiz.quizData.id],
        startAt: faker.date.past().toISOString(),
        endAt: faker.date.future().toISOString(),
      })
      await acceptAssessmentService({
        assessmentId: createdAssessment.id,
        token: faker.string.uuid(),
        userId: user.id,
      })
    })

    afterAll(async () => {
      await deleteAssessmentService({assessmentId: createdAssessment.id})
      await deleteQuizService({quizId: quiz.quizData.id})
      await prisma.codeLanguage.delete({where: {id: codeLanguageId}})
      await prisma.difficultyLevel.delete({where: {id: difficultyLevelId}})
      await prisma.user.delete({where: {id: userId}})
    })

    test('it should create candidate submission', async () => {
      const candidateSubmission = await createCandidateSubmissionService({
        assessmentId: createdAssessment.id,
        quizId: quiz.quizData.id,
        userId: user.id,
      })
      const retrievedAssessment = await getAssessmentService({
        assessmentId: createdAssessment.id,
      })
      const submissionData = retrievedAssessment?.submissions[0].data[0]

      expect(submissionData.status).toBe('STARTED')
      expect(submissionData.assessmentQuizSubmissions).toHaveLength(0)
      expect(submissionData.totalPoint).toBe(0)
    })
  })

  describe('Integration test: getAssessmentService', () => {
    const word = faker.lorem.word()
    const text = faker.lorem.text()
    const users = [{id: faker.string.uuid()}, {id: faker.string.uuid()}]
    const email_1 = 'user1@example.com'
    const email_2 = 'user2@example.com'
    const codeLanguages = [
      {id: faker.number.int({min: 1, max: 100}), name: text},
    ]
    const quizzes = [{id: faker.string.uuid()}, {id: faker.string.uuid()}]
    const userIds = users.map((u) => u.id)
    const codeLanguageIds = codeLanguages.map((l) => l.id)
    const quizIds = quizzes.map((q) => q.id)
    const codes = [
      'This is the first attempt',
      'This is the most recent attempt',
    ]
    let createdAssessment: any
    let assessmentPoints: Record<string, any>[]

    beforeAll(async () => {
      await prisma.user.create({data: {id: users[0].id, email: email_1}})
      await prisma.user.create({data: {id: users[1].id, email: email_2}})
      await createManyFakeCodeLanguage(codeLanguages)
      for (let i = 0; i < quizzes.length; i++) {
        await createFakeQuizzes({
          userId: users[0].id,
          quizId: quizzes[i].id,
          codeLanguageId: codeLanguages[0].id,
          difficultyLevelId: difficultyLevels[0].id,
        })
      }
      assessmentPoints = await createFakeAssessmentPoint()
      createdAssessment = await createAssessmentService({
        userId: users[0].id,
        title: word,
        description: word,
        quizIds,
        startAt: faker.date.past().toISOString(),
        endAt: faker.date.future().toISOString(),
      })
      for (let i = 0; i < users.length; i++) {
        await acceptAssessmentService({
          assessmentId: createdAssessment.id,
          token: faker.string.uuid(),
          userId: users[i].id,
        })
      }
      for (let i = 0; i < codes.length; i++) {
        await createFakeCandidateSubmission({
          userId: users[0].id,
          quizId: quizzes[0].id,
          assessmentId: createdAssessment.id,
          code: codes[i],
        })
        await createFakeCandidateSubmission({
          userId: users[0].id,
          quizId: quizzes[1].id,
          assessmentId: createdAssessment.id,
          code: codes[i],
        })
      }
    })

    afterAll(async () => {
      await deleteAssessmentService({assessmentId: createdAssessment.id})
      await prisma.quizPointCollection.deleteMany({
        where: {quizId: {in: quizIds}},
      })
      await prisma.submissionPoint.deleteMany({
        where: {userId: {in: userIds}},
      })
      await prisma.submission.deleteMany({where: {quizId: {in: quizIds}}})
      await prisma.quiz.deleteMany({where: {id: {in: quizIds}}})
      await prisma.codeLanguage.deleteMany({where: {id: {in: codeLanguageIds}}})
      await prisma.user.deleteMany({where: {id: {in: userIds}}})
    })

    test('it should return the assessment data', async () => {
      const receivedAssessment = await getAssessmentService({
        assessmentId: createdAssessment.id,
      })
      const assessmentQuizSubmissions =
        receivedAssessment?.submissions[0].data[1].assessmentQuizSubmissions

      receivedAssessment?.quizzes.forEach((q) => {
        delete q.difficultyLevel
      })

      const candidatePromises: Promise<any>[] = []

      users.forEach((user) => {
        candidatePromises.push(
          getCandidate({
            candidateId: user.id,
            assessmentId: createdAssessment.id,
          }),
        )
      })

      const candidates = await Promise.all(candidatePromises)

      expect(receivedAssessment?.data).toEqual(createdAssessment)
      expect(assessmentQuizSubmissions[0].submission.code).toBe(codes[1])
      expect(receivedAssessment?.quizzes).toMatchObject(quizzes)
      expect(receivedAssessment?.candidates).toMatchObject(users)
      expect(
        receivedAssessment?.submissions[0].data[0].assessmentQuizSubmissions,
      ).toHaveLength(1)
      expect(
        receivedAssessment?.submissions[1].data[0].assessmentQuizSubmissions,
      ).toHaveLength(0)
      expect(candidates[0].status).toBe('PENDING')
      expect(candidates[1].status).toBe('PENDING')
    })
  })

  describe('Integration test: updateAssessmentDataService', () => {
    const word = faker.lorem.words()
    const text = faker.lorem.text()
    const users = [{id: faker.string.uuid()}, {id: faker.string.uuid()}]
    const email_1 = 'user1@example.com'
    const email_2 = 'user2@example.com'
    const codeLanguages = [
      {id: faker.number.int({min: 1, max: 100}), name: text},
    ]
    const quizzes = [{id: faker.string.uuid()}, {id: faker.string.uuid()}]
    const userIds = users.map((u) => u.id)
    const codeLanguageIds = codeLanguages.map((l) => l.id)
    const quizIds = quizzes.map((q) => q.id)

    let createdAssessment: Record<string, any>

    beforeAll(async () => {
      await prisma.user.create({data: {id: users[0].id, email: email_1}})
      await prisma.user.create({data: {id: users[1].id, email: email_2}})
      await createManyFakeCodeLanguage(codeLanguages)
      for (let i = 0; i < quizzes.length; i++) {
        await createFakeQuizzes({
          userId: users[0].id,
          quizId: quizzes[i].id,
          codeLanguageId: codeLanguages[0].id,
          difficultyLevelId: difficultyLevels[0].id,
        })
      }
      createdAssessment = await createAssessmentService({
        userId: users[0].id,
        title: word,
        description: word,
        quizIds,
        startAt: faker.date.past().toISOString(),
        endAt: faker.date.future().toISOString(),
      })
    })

    afterAll(async () => {
      await deleteAssessmentService({assessmentId: createdAssessment.id})
      await prisma.quiz.deleteMany({where: {id: {in: quizIds}}})
      await prisma.codeLanguage.deleteMany({where: {id: {in: codeLanguageIds}}})
      await prisma.user.deleteMany({where: {id: {in: userIds}}})
    })

    test('it should update and return an assessment', async () => {
      const receivedAssessment = await updateAssessmentDataService({
        assessmentId: createdAssessment.id,
        description: word,
        title: word,
      })
      const expectedAssessment = await getAssessmentService({
        assessmentId: receivedAssessment.id,
      })

      expect(receivedAssessment).toEqual(expectedAssessment?.data)
    })
  })

  describe('Integration test: updateCandidateSubmissionService', () => {
    const email = faker.internet.email()
    const words = faker.lorem.words()
    const text = faker.lorem.text()
    const users = [{id: faker.string.uuid()}]
    const codeLanguages = [
      {id: faker.number.int({min: 1, max: 100}), name: text},
    ]
    const quizzes = [{id: faker.string.uuid()}]
    const userIds = users.map((u) => u.id)
    const codeLanguageIds = codeLanguages.map((l) => l.id)
    const quizIds = quizzes.map((q) => q.id)

    let createdAssessment: Record<string, any>
    let assessmentQuizSubmissionId: string

    beforeAll(async () => {
      await prisma.user.create({data: {id: users[0].id, email}})
      await createManyFakeCodeLanguage(codeLanguages)
      for (let i = 0; i < quizzes.length; i++) {
        await createFakeQuizzes({
          userId: users[0].id,
          quizId: quizzes[i].id,
          codeLanguageId: codeLanguages[0].id,
          difficultyLevelId: difficultyLevels[0].id,
        })
      }
      createdAssessment = await createAssessmentService({
        userId: users[0].id,
        title: words,
        description: words,
        quizIds,
        startAt: faker.date.past().toISOString(),
        endAt: faker.date.future().toISOString(),
      })
      await acceptAssessmentService({
        assessmentId: createdAssessment.id,
        token: faker.string.uuid(),
        userId: users[0].id,
      })
      const candidateSubmission = await createCandidateSubmissionService({
        assessmentId: createdAssessment.id,
        quizId: quizIds[0],
        userId: users[0].id,
      })
      assessmentQuizSubmissionId = candidateSubmission?.updatedAssessmentResult
        .assessmentQuizSubmissions[0].id as string
    })

    afterAll(async () => {
      await deleteAssessmentService({assessmentId: createdAssessment.id})
      await prisma.quizPointCollection.deleteMany({
        where: {quizId: {in: quizIds}},
      })
      await prisma.submissionPoint.deleteMany({
        where: {userId: {in: userIds}},
      })
      await prisma.submission.deleteMany({where: {quizId: {in: quizIds}}})
      await prisma.quiz.deleteMany({where: {id: {in: quizIds}}})
      await prisma.codeLanguage.deleteMany({where: {id: {in: codeLanguageIds}}})
      await prisma.user.deleteMany({where: {id: {in: userIds}}})
    })

    test('it should update candidate submission', async () => {
      await updateCandidateSubmissionService({
        assessmentQuizSubmissionId,
        code: words,
        userId: users[0].id,
        quizId: quizIds[0],
      })
      const retrievedAssessment = await getAssessmentService({
        assessmentId: createdAssessment.id,
      })
      const submissionData = retrievedAssessment?.submissions[0].data[0]

      expect(submissionData.status).toBe('COMPLETED')
      expect(submissionData.assessmentQuizSubmissions).toHaveLength(1)
      expect(submissionData.totalPoint).toBeGreaterThan(0)
    })
  })

  describe('Integration test: createManyAssessmentService', () => {
    let assessments: Record<string, any> = {}

    const email = faker.internet.email()
    const word = faker.lorem.word()
    const userId = faker.string.uuid()
    const assessmentId_1 = faker.string.uuid()
    const assessmentId_2 = faker.string.uuid()
    const assessmentIds = [
      {assessmentId: assessmentId_1},
      {assessmentId: assessmentId_2},
    ]

    beforeAll(async () => {
      await prisma.user.create({data: {id: userId, name: word, email}})
      assessments = await prisma.assessment.createMany({
        data: [
          {id: assessmentId_1, title: word, description: word, ownerId: userId},
          {id: assessmentId_2, title: word, description: word, ownerId: userId},
        ],
      })
    })

    afterAll(async () => {
      await prisma.assessment.deleteMany({
        where: {id: {in: [assessmentId_1, assessmentId_2]}},
      })
      await prisma.user.delete({where: {id: userId}})
    })

    test('it should return many assessments', async () => {
      const expectedAssessments: any = []

      for (let i = 0; i < assessments.count; i++) {
        expectedAssessments.push(
          await prisma.assessment.findUnique({
            where: {id: assessmentIds[i].assessmentId},
            select: {
              id: true,
              title: true,
              owner: {
                select: {
                  name: true,
                },
              },
              assessmentQuizzes: {
                select: {
                  quizId: true,
                },
              },
              assessmentCandidates: {
                select: {
                  status: true,
                  candidate: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
              createdAt: true,
              description: true,
            },
          }),
        )
      }

      expect(await getManyAssessmentService({userId})).toEqual(
        expectedAssessments,
      )
    })
  })

  describe('Integration test: deleteAssessmentService', () => {
    const email = faker.internet.email()
    const word = faker.lorem.word()
    const text = faker.lorem.text()
    const users = [{id: faker.string.uuid()}]
    const codeLanguages = [
      {id: faker.number.int({min: 1, max: 100}), name: text},
    ]
    const quizzes = [{id: faker.string.uuid()}, {id: faker.string.uuid()}]
    const userIds = users.map((u) => u.id)
    const codeLanguageIds = codeLanguages.map((l) => l.id)
    const quizIds = quizzes.map((q) => q.id)

    let createdAssessment: any

    beforeAll(async () => {
      await prisma.user.create({data: {id: users[0].id, email}})
      await createManyFakeCodeLanguage(codeLanguages)
      for (let i = 0; i < quizzes.length; i++) {
        await createFakeQuizzes({
          userId: users[0].id,
          quizId: quizzes[i].id,
          codeLanguageId: codeLanguages[0].id,
          difficultyLevelId: difficultyLevels[0].id,
        })
      }

      createdAssessment = await createAssessmentService({
        userId: users[0].id,
        title: word,
        description: word,
        quizIds,
        startAt: faker.date.past().toISOString(),
        endAt: faker.date.future().toISOString(),
      })
    })

    afterAll(async () => {
      await prisma.quiz.deleteMany({where: {id: {in: quizIds}}})
      await prisma.codeLanguage.deleteMany({where: {id: {in: codeLanguageIds}}})
      await prisma.user.deleteMany({where: {id: {in: userIds}}})
    })

    test('it should delete an assessment', async () => {
      await deleteAssessmentService({assessmentId: createdAssessment.id})

      const receivedAssessment = await getAssessmentService({
        assessmentId: createdAssessment.id,
      })

      expect(receivedAssessment).toEqual(null)
    })
  })

  describe('Integration test: addAssessmentCandidateService ', () => {
    const word = faker.lorem.word()
    const text = faker.lorem.text()
    const users = [{id: faker.string.uuid()}, {id: faker.string.uuid()}]
    const email_1 = faker.internet.email()
    const email_2 = faker.internet.email()
    const codeLanguages = [
      {id: faker.number.int({min: 1, max: 100}), name: text},
    ]
    const quizzes = [{id: faker.string.uuid()}, {id: faker.string.uuid()}]
    const userIds = users.map((u) => u.id)
    const codeLanguageIds = codeLanguages.map((l) => l.id)
    const quizIds = quizzes.map((q) => q.id)
    const codes = [
      'This is the first attempt',
      'This is the most recent attempt',
    ]
    let createdAssessment: any

    beforeAll(async () => {
      await prisma.user.create({
        data: {id: users[0].id, name: text, email: email_1},
      })
      await prisma.user.create({
        data: {id: users[1].id, name: text, email: email_2},
      })
      await createManyFakeCodeLanguage(codeLanguages)
      for (let i = 0; i < quizzes.length; i++) {
        await createFakeQuizzes({
          userId: users[0].id,
          quizId: quizzes[i].id,
          codeLanguageId: codeLanguages[0].id,
          difficultyLevelId: difficultyLevels[0].id,
        })
      }
      createdAssessment = await createAssessmentService({
        userId: users[0].id,
        title: word,
        description: word,
        quizIds,
        startAt: faker.date.past().toISOString(),
        endAt: faker.date.future().toISOString(),
      })
      for (let i = 0; i < users.length; i++) {
        await acceptAssessmentService({
          assessmentId: createdAssessment.id,
          token: faker.string.uuid(),
          userId: users[i].id,
        })
      }
      for (let i = 0; i < codes.length; i++) {
        await createFakeCandidateSubmission({
          userId: users[0].id,
          quizId: quizzes[0].id,
          assessmentId: createdAssessment.id,
          code: codes[i],
        })
        await createFakeCandidateSubmission({
          userId: users[0].id,
          quizId: quizzes[1].id,
          assessmentId: createdAssessment.id,
          code: codes[i],
        })
      }
    })

    afterAll(async () => {
      await deleteAssessmentService({assessmentId: createdAssessment.id})
      await prisma.quizPointCollection.deleteMany({
        where: {quizId: {in: quizIds}},
      })
      await prisma.submissionPoint.deleteMany({
        where: {userId: {in: userIds}},
      })
      await prisma.submission.deleteMany({where: {quizId: {in: quizIds}}})
      await prisma.quiz.deleteMany({where: {id: {in: quizIds}}})
      await prisma.codeLanguage.deleteMany({where: {id: {in: codeLanguageIds}}})
      await prisma.user.deleteMany({where: {id: {in: userIds}}})
    })

    test('it should return the assessment data', async () => {
      sendMailMock.mockResolvedValue(nodemailerResponse)
      await addAssessmentCandidateService({
        newCandidateEmails: ['newguys@gmail.com'],
        assessmentId: createdAssessment.id,
      })
      const receivedAssessment = await getAssessmentService({
        assessmentId: createdAssessment.id,
      })
      receivedAssessment?.quizzes.forEach((q) => {
        delete q.difficultyLevel
      })

      expect(receivedAssessment?.candidates[2].email).toBe('newguys@gmail.com')
      expect(receivedAssessment?.submissions[2].name).toBe('newguys')
      expect(receivedAssessment?.submissions[2].data).toHaveLength(2)
    })
  })
})
