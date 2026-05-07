import { IsIn } from 'class-validator';

export class UpdateReviewReportStatusDto {
  @IsIn(['RESOLVED', 'DISMISSED'])
  status!: 'RESOLVED' | 'DISMISSED';
}
